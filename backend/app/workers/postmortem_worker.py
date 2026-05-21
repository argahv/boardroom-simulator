from redis import Redis
from rq import Worker

from app import config


def main() -> None:
    redis = Redis.from_url(config.REDIS_URL)
    worker = Worker([config.RQ_QUEUE_POSTMORTEM], connection=redis)
    worker.work()


if __name__ == "__main__":
    main()
