-- Accounting Phase 1.5 hardening — accounting-only constraints and immutability triggers

ALTER TABLE "AccountingPeriod"
ADD CONSTRAINT "AccountingPeriod_valid_dates_check"
CHECK ("endDate" >= "startDate");

CREATE OR REPLACE FUNCTION accounting_prevent_posted_journal_entry_mutation()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'POSTED' THEN
    RAISE EXCEPTION 'POSTED journal entries are immutable (entry %)', OLD."entryNumber"
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION accounting_prevent_posted_journal_entry_delete()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'POSTED' THEN
    RAISE EXCEPTION 'POSTED journal entries cannot be deleted (entry %)', OLD."entryNumber"
      USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION accounting_prevent_posted_journal_line_mutation()
RETURNS trigger AS $$
DECLARE
  header_status "AccountingJournalStatus";
BEGIN
  SELECT status INTO header_status
  FROM "AccountingJournalEntry"
  WHERE id = COALESCE(NEW."journalEntryId", OLD."journalEntryId");

  IF header_status = 'POSTED' THEN
    RAISE EXCEPTION 'Journal lines on POSTED entries are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS accounting_journal_entry_immutable_update ON "AccountingJournalEntry";
CREATE TRIGGER accounting_journal_entry_immutable_update
BEFORE UPDATE ON "AccountingJournalEntry"
FOR EACH ROW EXECUTE FUNCTION accounting_prevent_posted_journal_entry_mutation();

DROP TRIGGER IF EXISTS accounting_journal_entry_immutable_delete ON "AccountingJournalEntry";
CREATE TRIGGER accounting_journal_entry_immutable_delete
BEFORE DELETE ON "AccountingJournalEntry"
FOR EACH ROW EXECUTE FUNCTION accounting_prevent_posted_journal_entry_delete();

DROP TRIGGER IF EXISTS accounting_journal_line_immutable_update ON "AccountingJournalLine";
CREATE TRIGGER accounting_journal_line_immutable_update
BEFORE UPDATE ON "AccountingJournalLine"
FOR EACH ROW EXECUTE FUNCTION accounting_prevent_posted_journal_line_mutation();

DROP TRIGGER IF EXISTS accounting_journal_line_immutable_delete ON "AccountingJournalLine";
CREATE TRIGGER accounting_journal_line_immutable_delete
BEFORE DELETE ON "AccountingJournalLine"
FOR EACH ROW EXECUTE FUNCTION accounting_prevent_posted_journal_line_mutation();

CREATE OR REPLACE FUNCTION accounting_prevent_posted_event_downgrade()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'POSTED' AND NEW.status <> 'POSTED' THEN
    RAISE EXCEPTION 'POSTED posting events cannot transition to %', NEW.status
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS accounting_posting_event_posted_lock ON "AccountingPostingEvent";
CREATE TRIGGER accounting_posting_event_posted_lock
BEFORE UPDATE ON "AccountingPostingEvent"
FOR EACH ROW EXECUTE FUNCTION accounting_prevent_posted_event_downgrade();
