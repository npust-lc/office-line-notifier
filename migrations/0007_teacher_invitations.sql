-- 長效邀請只保存雜湊；LINE 授權資料限短期使用，不能匯出到一般紀錄備份。
CREATE TABLE binding_invitations (
 id TEXT PRIMARY KEY, teacher_id TEXT NOT NULL UNIQUE REFERENCES teachers(id),
 token_hash TEXT NOT NULL UNIQUE, issued_by TEXT NOT NULL REFERENCES admins(id),
 issued_at TEXT NOT NULL, revoked_at TEXT, used_at TEXT
);
CREATE TABLE binding_oauth (
 state_hash TEXT PRIMARY KEY, invitation_id TEXT NOT NULL REFERENCES binding_invitations(id),
 browser_hash TEXT NOT NULL UNIQUE, nonce TEXT NOT NULL, verifier TEXT NOT NULL,
 expires_at INTEGER NOT NULL, claim_token TEXT, line_user_id TEXT,
 access_token_sealed TEXT, verified_at TEXT, completed_at TEXT
);
CREATE INDEX binding_oauth_expiry ON binding_oauth(expires_at);
CREATE TRIGGER invalidate_teacher_invitation AFTER UPDATE OF active,line_user_id ON teachers
BEGIN
 UPDATE binding_invitations SET revoked_at=coalesce(revoked_at,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
 WHERE teacher_id=NEW.id AND (NEW.active=0 OR (OLD.line_user_id IS NOT NULL AND NEW.line_user_id IS NULL));
 UPDATE binding_invitations SET used_at=coalesce(used_at,NEW.bound_at)
 WHERE teacher_id=NEW.id AND NEW.line_user_id IS NOT NULL;
 UPDATE binding_codes SET used_at=coalesce(used_at,NEW.bound_at) WHERE teacher_id=NEW.id AND NEW.line_user_id IS NOT NULL;
END;
