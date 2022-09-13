import {
  AUTO_ACTIVATE_NEW_USERS,
  SERVER_URL,
  EMAILS_ENABLE,
  DEFAULT_USER_ROLE,
  DEFAULT_ALLOWED_USER_ROLES,
  ALLOWED_USER_ROLES,
  VERIFY_EMAILS,
  REDIRECT_URL_ERROR,
} from '@shared/config'
import { Request, Response } from 'express'
import { asyncWrapper, checkHibp, hashPassword, selectAccount } from '@shared/helpers'
import { newJwtExpiry, createHasuraJwt } from '@shared/jwt'

import Boom from '@hapi/boom'
import { emailClient } from '@shared/email'
import { insertAccount, insertTUser } from '@shared/queries'
import { setRefreshToken } from '@shared/cookies'
import { registerSchema } from '@shared/validation'
import { request } from '@shared/request'
import { v4 as uuidv4 } from 'uuid'
import { InsertAccountData, InsertTUserData, UserData, Session } from '@shared/types'

async function registerAccount({ body }: Request, res: Response): Promise<unknown> {
  let hasuraData: InsertTUserData
  const useCookie = typeof body.cookie !== 'undefined' ? body.cookie : true

  const {
    email,
    password,
    user_data = {},
    register_options = {}
  } = await registerSchema.validateAsync(body)

  if (await selectAccount(body)) {
    throw Boom.badRequest('Account already exists.')
  }

  await checkHibp(password)

  const ticket = uuidv4()
  const now = new Date()
  const ticket_expires_at = new Date()
  ticket_expires_at.setTime(now.getTime() + 60 * 60 * 1000) // active for 60 minutes
  const password_hash = await hashPassword(password)

  const defaultRole = register_options.default_role ?? DEFAULT_USER_ROLE
  const allowedRoles = register_options.allowed_roles ?? DEFAULT_ALLOWED_USER_ROLES

  // check if default role is part of allowedRoles
  if (!allowedRoles.includes(defaultRole)) {
    throw Boom.badRequest('Default role must be part of allowed roles.')
  }

  // check if allowed roles is a subset of ALLOWED_ROLES
  if (!allowedRoles.every((role: string) => ALLOWED_USER_ROLES.includes(role))) {
    throw Boom.badRequest('allowed roles must be a subset of ALLOWED_ROLES')
  }

  const accountRoles = allowedRoles.map((role: string) => ({ role }))

  let accounts: InsertAccountData
  try {
    accounts = await request<InsertAccountData>(insertAccount, {
      account: {
        email,
        password_hash,
        ticket,
        ticket_expires_at,
        active: AUTO_ACTIVATE_NEW_USERS,
        default_role: defaultRole,
        account_roles: {
          data: accountRoles
        },
        user: {
          data: { display_name: email, ...user_data }
        }
      }
    })
  } catch (e) {
    console.error('Error inserting user account')
    console.error(e)
    throw Boom.badImplementation('Error inserting user account')
  }

  const account = accounts.insert_auth_accounts.returning[0]
  const user: UserData = {
    id: account.user.id,
    name: account.user.name,
    display_name: account.user.display_name,
    email: account.email,
    avatar_url: account.user.avatar_url
  }

  if (!AUTO_ACTIVATE_NEW_USERS && VERIFY_EMAILS) {
    if (!EMAILS_ENABLE) {
      throw Boom.badImplementation('SMTP settings unavailable')
    }

    // use display name from `user_data` if available
    const display_name = 'display_name' in user_data ? user_data.display_name : email

    try {
      await emailClient.send({
        template: 'activate-account',
        message: {
          to: email,
          headers: {
            'x-ticket': {
              prepared: true,
              value: ticket
            }
          }
        },
        locals: {
          display_name,
          ticket,
          url: SERVER_URL
        }
      })
    } catch (err) {
      console.error(err)
      throw Boom.badImplementation()
    }

    let session: Session = { jwt_token: null, jwt_expires_in: null, user }
    return res.send(session)
  }

  try {
    hasuraData = await request<InsertTUserData>(insertTUser, {
      name,
      email,
    })
  } catch (err) /* istanbul ignore next */ {
    console.error(err)
    if (REDIRECT_URL_ERROR) {
      return res.redirect(302, REDIRECT_URL_ERROR as string)
    }
    throw err
  }
  const { name : inserted_name } = hasuraData.insert_treasure_user_one

  if (!inserted_name) {
    console.error('Error occurs when TUser inserts.')

    if (REDIRECT_URL_ERROR) {
      return res.redirect(302, REDIRECT_URL_ERROR as string)
    }
    /* istanbul ignore next */
    throw Boom.unauthorized('Error occurs when TUser inserts.')
  }

  const refresh_token = await setRefreshToken(res, account.id, useCookie)

  // generate JWT
  const jwt_token = createHasuraJwt(account)
  const jwt_expires_in = newJwtExpiry
  
  let session: Session = { jwt_token, jwt_expires_in, user }
  if (!useCookie) session.refresh_token = refresh_token

  return res.send(session)
}

export default asyncWrapper(registerAccount)
