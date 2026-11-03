import i18n from './index';
import {zhCN} from './zh-CN';
import type {LearningSession} from '@/lib/types';

type CourseId = keyof typeof zhCN.courses;

function isCourseId(id: string): id is CourseId {
  return id in zhCN.courses;
}

export function courseTitle(id: string, fallback = id): string {
  return isCourseId(id) ? i18n.t(`courses.${id}.title`) : fallback;
}

export function courseSubtitle(id: string, fallback = ''): string {
  return isCourseId(id) ? i18n.t(`courses.${id}.subtitle`) : fallback;
}

export function localizeSessionTitle(session: Pick<LearningSession, 'task_id'|'title'|'title_version'>): string {
  if (!isCourseId(session.task_id) || session.title_version > 0) return session.title;
  const source = zhCN.courses[session.task_id].title;
  const title = courseTitle(session.task_id, session.title);
  if (session.title === source) return title;
  if (session.title.startsWith(source)) {
    const number = session.title.slice(source.length);
    if (/^\d+$/.test(number)) return i18n.t(`courses.${session.task_id}.historyTitle`, {title, number});
  }
  return session.title;
}

export function localizeFocusTitle(value: string): string {
  for (const [courseId, course] of Object.entries(zhCN.courses)) {
    for (const [objectiveId, title] of Object.entries(course.objectives)) {
      if (title === value) return i18n.t(`courses.${courseId}.objectives.${objectiveId}`);
    }
  }
  return value;
}
