alter table auth.account_providers
    add provider_access_token text;

alter table auth.account_providers
    add provider_refresh_token text;

alter table auth.accounts
    drop constraint accounts_user_id_key;

