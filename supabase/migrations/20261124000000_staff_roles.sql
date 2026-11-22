-- Two more staff roles (web/lib/rbac.ts): admin manages accounts and does what a manager does; auditor reads
-- cases, insights and the account audit log and runs no command. Their own file: a new enum value cannot be used
-- in the transaction that adds it, and 20261124000100_better_auth.sql uses both.
alter type public.staff_role add value if not exists 'admin';
alter type public.staff_role add value if not exists 'auditor';
