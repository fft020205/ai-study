"""Single product persistence boundary. SQLite for local use, PostgreSQL supported."""
import copy
from pathlib import Path
from sqlalchemy import create_engine, Column, String, Integer, JSON, select, update, delete
from sqlalchemy.orm import declarative_base, Session
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from .history_names import numbered_history_title

Base = declarative_base()

class LearningRow(Base):
    __tablename__ = 'learning_sessions'
    id = Column(String(36), primary_key=True)
    owner = Column(String(64), nullable=False, index=True)
    version = Column(Integer, nullable=False)
    state = Column(JSON, nullable=False)

class SessionTitleRow(Base):
    __tablename__ = 'session_titles'
    id = Column(String(36), primary_key=True)
    title = Column(String(80), nullable=False)
    version = Column(Integer, nullable=False, default=1)

class HistoryCounterRow(Base):
    __tablename__ = 'history_title_counters'
    owner = Column(String(64), primary_key=True)
    task_id = Column(String(40), primary_key=True)
    value = Column(Integer, nullable=False)

class Conflict(Exception): pass
class Missing(Exception): pass

class Repository:
    def __init__(self, url):
        if url.startswith('sqlite:///'):
            Path(url.removeprefix('sqlite:///')).parent.mkdir(parents=True, exist_ok=True)
        self.engine = create_engine(url, connect_args={'check_same_thread': False} if url.startswith('sqlite') else {})
        Base.metadata.create_all(self.engine)
        self._initialize_titles()

    def _initialize_titles(self):
        # One transaction gives legacy unnamed records stable metadata, without lesson writes.
        with Session(self.engine) as db:
            rows=sorted(db.scalars(select(LearningRow)),key=lambda row:(row.state['created_at'],row.id))
            titles={row.id:row for row in db.scalars(select(SessionTitleRow))}
            counters={(row.owner,row.task_id):row for row in db.scalars(select(HistoryCounterRow))}
            existing_groups=set(counters);used={}
            for row in rows:
                if row.id in titles:used.setdefault(row.owner,set()).add(titles[row.id].title)
            for row in rows:
                key=(row.owner,row.state['task_id']);metadata=titles.get(row.id)
                if metadata is not None and key in existing_groups:continue
                if key not in counters:
                    counters[key]=HistoryCounterRow(owner=key[0],task_id=key[1],value=0);db.add(counters[key])
                counter=counters[key];counter.value+=1
                if metadata is not None:continue  # Preserve user-written names and their revisions.
                names=used.setdefault(row.owner,set())
                title=numbered_history_title(key[1],counter.value)
                while title in names:
                    counter.value+=1;title=numbered_history_title(key[1],counter.value)
                db.add(SessionTitleRow(id=row.id,title=title,version=0));names.add(title)
            db.commit()

    def _next_title(self,db,owner,task_id):
        insert=sqlite_insert if self.engine.dialect.name=='sqlite' else postgres_insert
        while True:
            statement=insert(HistoryCounterRow).values(owner=owner,task_id=task_id,value=1)
            statement=statement.on_conflict_do_update(index_elements=['owner','task_id'],
                set_={'value':HistoryCounterRow.value+1}).returning(HistoryCounterRow.value)
            number=db.scalar(statement);title=numbered_history_title(task_id,number)
            collision=db.scalar(select(SessionTitleRow.id).join(LearningRow,LearningRow.id==SessionTitleRow.id)
                .where(LearningRow.owner==owner,SessionTitleRow.title==title).limit(1))
            if collision is None:return title

    def create(self, owner, state):
        persisted=copy.deepcopy(state)
        persisted.pop('custom_title',None);persisted.pop('title_version',None)
        with Session(self.engine) as db:
            title=self._next_title(db,owner,state['task_id'])
            db.add(LearningRow(id=state['id'], owner=owner, version=state['version'], state=persisted))
            db.add(SessionTitleRow(id=state['id'],title=title,version=0))
            db.commit()
        state.update(custom_title=title,title_version=0)

    @staticmethod
    def _with_title(row, title):
        state=copy.deepcopy(row.state)
        state.pop('custom_title',None);state.pop('title_version',None)
        if title:state.update(custom_title=title.title,title_version=title.version)
        return state

    def get(self, owner, sid):
        with Session(self.engine) as db:
            row = db.scalar(select(LearningRow).where(LearningRow.id == sid, LearningRow.owner == owner))
            if row is None: raise Missing()
            return self._with_title(row,db.get(SessionTitleRow,sid))

    def list(self, owner):
        with Session(self.engine) as db:
            rows=db.execute(select(LearningRow,SessionTitleRow).outerjoin(SessionTitleRow,SessionTitleRow.id==LearningRow.id).where(LearningRow.owner==owner))
            return sorted([self._with_title(row,title) for row,title in rows],key=lambda x:x['updated_at'],reverse=True)

    def save(self, owner, state, expected):
        state['version'] = expected + 1
        persisted=copy.deepcopy(state)
        persisted.pop('custom_title',None);persisted.pop('title_version',None)
        with Session(self.engine) as db:
            result = db.execute(update(LearningRow).where(LearningRow.id == state['id'], LearningRow.owner == owner, LearningRow.version == expected).values(state=persisted, version=state['version']))
            if result.rowcount != 1:
                db.rollback()
                raise Conflict()
            db.commit()

    def rename(self, owner, sid, title):
        # Display metadata has its own revision; never cancels a lesson or its WS run.
        with Session(self.engine) as db:
            if db.scalar(select(LearningRow.id).where(LearningRow.id==sid,LearningRow.owner==owner)) is None:raise Missing()
            metadata=db.get(SessionTitleRow,sid)
            if metadata is None:
                metadata=SessionTitleRow(id=sid,title=title,version=1);db.add(metadata)
            elif metadata.title!=title:
                metadata.title=title;metadata.version+=1
            result={'id':sid,'title':title,'title_version':metadata.version}
            db.commit()
            return result

    def delete(self, owner, sid):
        with Session(self.engine) as db:
            if db.scalar(select(LearningRow.id).where(LearningRow.id==sid,LearningRow.owner==owner)) is None:raise Missing()
            db.execute(delete(SessionTitleRow).where(SessionTitleRow.id==sid))
            db.execute(delete(LearningRow).where(LearningRow.id == sid, LearningRow.owner == owner))
            db.commit()
