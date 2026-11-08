-- Apply before deploying the API that reads and writes complaint detail.
BEGIN;

ALTER TABLE visit
    ADD COLUMN IF NOT EXISTS complaint_detail text CONSTRAINT visit_complaint_detail_check CHECK (
        complaint_detail IS NULL OR (
            complaint_group = 'general' AND char_length(complaint_detail) BETWEEN 1 AND 200
            AND complaint_detail ~ '[^[:space:]]'
        )
    );

COMMIT;
