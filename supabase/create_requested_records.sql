create table requested_records (
  "requestId"  text        primary key,
  "recordList" text[]      not null default '{}'
);
