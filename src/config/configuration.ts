export default () => ({
  port: parseInt(process.env.PORT ?? '3004', 10),
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'change-me',
  },
  feed: {
    sessionTtlHours: parseInt(process.env.FEED_SESSION_TTL_HOURS ?? '24', 10),
    pageSize: parseInt(process.env.FEED_PAGE_SIZE ?? '20', 10),
  },
  rabbitmq: {
    url: process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672',
  },
});
