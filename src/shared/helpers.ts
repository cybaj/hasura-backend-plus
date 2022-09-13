import { HIBP_ENABLE, COOKIE_SECRET } from './config'
import { NextFunction, Response } from 'express'
import {
  rotateTicket as rotateTicketQuery,
  selectAccountByEmail as selectAccountByEmailQuery,
  selectAccountByTicket as selectAccountByTicketQuery,
  selectAccountByUserId as selectAccountByUserIdQuery,
  selectAccountByUserName as selectAccountByUserNameQuery,
  selectUserByName as selectUserByNameQuery,
} from './queries'

import Boom from '@hapi/boom'
import QRCode from 'qrcode'
import bcrypt from 'bcryptjs'
import { pwnedPassword } from 'hibp'
import { request } from './request'
import { v4 as uuidv4 } from 'uuid'
import { AccountData, QueryAccountData, QueryUserData, PermissionVariables, RequestExtended, UserData } from './types'

/**
 * Create QR code.
 * @param secret Required OTP secret.
 */
export async function createQR(secret: string): Promise<string> {
  try {
    return await QRCode.toDataURL(secret)
  } catch (err) {
    throw Boom.badImplementation()
  }
}

/**
 * This wrapper function sends any route errors to `next()`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function asyncWrapper(fn: any) {
  return function (req: RequestExtended, res: Response, next: NextFunction): void {
    fn(req, res, next).catch(next)
  }
}

export const selectUserByName = async (name: string): Promise<UserData> => {
  const hasuraData = await request<QueryUserData>(selectUserByNameQuery, { name })
  if (!hasuraData.users[0]) throw Boom.badRequest('User does not exist.')
  return hasuraData.users[0]
}

export const selectAccountByUserName = async (name: string): Promise<AccountData> => {
  const hasuraData = await request<QueryAccountData>(selectAccountByUserNameQuery, { name })
  if (!hasuraData.auth_accounts[0]) throw Boom.badRequest('Account does not exist.')
  return hasuraData.auth_accounts[0]
}

export const selectAccountByEmail = async (email: string): Promise<AccountData> => {
  const hasuraData = await request<QueryAccountData>(selectAccountByEmailQuery, { email })
  if (!hasuraData.auth_accounts[0]) throw Boom.badRequest('Account does not exist.')
  return hasuraData.auth_accounts[0]
}

export const selectAccountByTicket = async (ticket: string): Promise<AccountData> => {
  const hasuraData = await request<QueryAccountData>(selectAccountByTicketQuery, { ticket })
  if (!hasuraData.auth_accounts[0]) throw Boom.badRequest('Account does not exist.')
  return hasuraData.auth_accounts[0]
}

// TODO await request returns undefined if no user found!
// TODO there can be multiple accounts with the same userID now; this is broken!
export const selectAccountByUserId = async (user_id: string | undefined): Promise<AccountData> => {
  if (!user_id) {
    throw Boom.badRequest('Invalid User Id.')
  }
  const hasuraData = await request<QueryAccountData>(selectAccountByUserIdQuery, { user_id })
  if (!hasuraData.auth_accounts[0]) throw Boom.badRequest('Account does not exist.')
  return hasuraData.auth_accounts[0]
}

/**
 * Looks for an account in the database, first by email, second by ticket
 * @param httpBody
 * @return account data, null if account is not found
 */
export const selectAccount = async (httpBody: {
  [key: string]: string
}): Promise<AccountData | undefined> => {
  const { email, ticket } = httpBody
  try {
    return await selectAccountByEmail(email)
  } catch {
    try {
      return await selectAccountByTicket(ticket)
    } catch {
      return undefined
    }
  }
}

/**
 * Looks for an account in the database, first by email, second by ticket
 * @param httpBody
 * @return account data, null if account is not found
 */
export const selectAccount2 = async (httpBody: {
  [key: string]: string
}): Promise<AccountData | undefined> => {
  const { name, ticket } = httpBody
  try {
    return await selectAccountByUserName(name)
  } catch {
    try {
      return await selectAccountByTicket(ticket)
    } catch {
      return undefined
    }
  }
}

/**
 * Password hashing function.
 * @param password Password to hash.
 */
export const hashPassword = async (password: string): Promise<string> => {
  try {
    return await bcrypt.hash(password, 10)
  } catch (err) {
    throw Boom.badImplementation()
  }
}

/**
 * Checks password against the HIBP API.
 * @param password Password to check.
 */
export const checkHibp = async (password: string): Promise<void> => {
  if (HIBP_ENABLE && (await pwnedPassword(password))) {
    throw Boom.badRequest('Password is too weak.')
  }
}

export const generateRandomString = (): string => Math.random().toString(36).replace('0.', '')

export const rotateTicket = async (ticket: string): Promise<string> => {
  const new_ticket = uuidv4()
  await request(rotateTicketQuery, {
    ticket,
    now: new Date(),
    new_ticket
  })
  return new_ticket
}

export const getPermissionVariablesFromCookie = (req: RequestExtended): PermissionVariables => {
  const { permission_variables } = COOKIE_SECRET ? req.signedCookies : req.cookies
  if (!permission_variables) throw Boom.unauthorized()
  return JSON.parse(permission_variables)
}
