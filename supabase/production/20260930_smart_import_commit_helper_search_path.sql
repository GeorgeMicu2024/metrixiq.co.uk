
alter function private.smart_import_num(jsonb,text) set search_path = private, public;
alter function private.smart_import_merge_raw(jsonb,jsonb) set search_path = private, public;
alter function private.smart_import_performance(numeric,numeric,numeric,numeric) set search_path = private, public;
alter function private.smart_import_risk(numeric,numeric,numeric,numeric,numeric,numeric) set search_path = private, public;
alter function private.smart_import_issue(numeric,numeric,numeric,numeric,numeric,numeric) set search_path = private, public;
