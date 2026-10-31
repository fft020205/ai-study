# Adaptive Cognitive Load Analysis 上游引擎

来源：https://github.com/rajatmurhe/adaptive-cognitive-load-analysis
固定提交：0c938e4fec21a852401c10213127a630d0b6cf75

cognitive_engine.py为原仓库backend/cognitive_engine.py原文，校验信息见upstream.lock.json。实际由services/api/study/vision.py适配并调用，未启动上游带公开CORS、CSV和PDF副作用的服务。只接入用户指定的本地视觉判定流程。

上游当前没有声明许可证；本地保留来源与代码，未声称获得再分发或商业授权。对外发布前需解决其许可。核心类未改写；适配器按有效观测时间推进其time.time时钟，让无脸/低质/停采不会完成校准。原算法是启发式行为指数，不能当作临床心理状态或概率。
