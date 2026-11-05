-- A person has already replied: New becomes Ongoing. Later labels stay as they are.
UPDATE "EnquiryThread" t
SET "crmPipeline" = 'ONGOING'
WHERE t."crmPipeline" = 'NEW'
  AND EXISTS (
    SELECT 1 FROM "EnquiryMessage" m
    WHERE m."threadId" = t.id
      AND m."authorType" = 'ADMIN'
      AND m."authorName" <> 'Sarveda Assistant'
  );

-- Closed, and nobody on the team has replied: the pipeline is New.
UPDATE "EnquiryThread" t
SET "crmPipeline" = 'NEW'
WHERE t.status = 'CLOSED'
  AND t."crmPipeline" <> 'NEW'
  AND NOT EXISTS (
    SELECT 1 FROM "EnquiryMessage" m
    WHERE m."threadId" = t.id
      AND m."authorType" = 'ADMIN'
      AND m."authorName" <> 'Sarveda Assistant'
  );
