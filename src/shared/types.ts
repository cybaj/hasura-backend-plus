import { Request } from 'express'

export type ClaimValueType =
  | string
  | string[]
  | number
  | number[]
  | RegExp
  | RegExp[]
  | boolean
  | boolean[]
  | null
  | undefined

/**
 * Claims interface.
 */
export interface Claims {
  'x-hasura-user-id': string
  'x-hasura-default-role': string
  'x-hasura-allowed-roles': string[]
  [key: string]: ClaimValueType
}

/**
 * PermissionVariables interface.
 */
export interface PermissionVariables {
  'user-id': string
  'default-role': string
  'allowed-roles': string[]
  [key: string]: ClaimValueType
}

/**
 * Token interface.
 */
export type Token = {
  [key: string]: Claims
} & {
  exp: bigint
  iat: bigint
}

export interface Session {
  jwt_token: string | null;
  jwt_expires_in: number | null;
  refresh_token?: string
  user: UserData;
}

export interface UserData {
  [key: string]: ClaimValueType
  id: string
  email?: string
  name: string
  display_name: string
  phone_number?: string
  avatar_url?: string
}

export interface AccountData {
  id: string
  user: UserData
  active: boolean
  default_role: string
  account_roles: { role: string }[]
  is_anonymous: boolean
  ticket?: string
  otp_secret?: string
  mfa_enabled: boolean
  password_hash: string
  email: string
  new_email?: string
}

export interface QueryAccountData {
  auth_accounts: AccountData[]
}

export type QueryUserData = {
  users: UserData[]
}

export interface UpdateAccountData {
  update_auth_accounts: {
    affected_rows: number
    // AccountData[]
  }
}

export interface DeleteAccountData {
  delete_auth_accounts: { affected_rows: number }
}
interface AccountProvider {
  id: string
  account: AccountData
}

export interface InsertTUserData {
  insert_treasure_user_one: {
    name: string
    id: number
  }
}

export interface InsertCurrencyData {
  insert_currency_one: {
    hash: string
    updated_at: string
  }
}


export interface QueryAccountProviderData {
  auth_account_providers: AccountProvider[]
}

export interface InsertAccountData {
  insert_auth_accounts: {
    returning: AccountData[]
  }
}

export interface InsertAccountProviderToUser {
  insert_auth_account_providers_one: {
    account: AccountData
  }
}

export type UpdateProviderTokens = UpdateProviderTokensData | { errors: unknown }

interface UpdateProviderTokensData {
  update_auth_account_providers_by_pk: {
    updated_at: string
  }
}

export interface RefreshTokenMiddleware {
  value: string | null
  type: 'query' | 'cookie' | null
}

export interface RequestExtended extends Request {
  refresh_token?: RefreshTokenMiddleware
  permission_variables?: PermissionVariables
}

export interface SetNewEmailData {
  update_auth_accounts: {
    returning: {
      user: UserData
    }[]
    affected_rows: number
  }
}
