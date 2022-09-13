import {
  AUTO_ACTIVATE_NEW_USERS,
  DEFAULT_USER_ROLE,
  DEFAULT_ALLOWED_USER_ROLES,
  ALLOWED_USER_ROLES,
  REDIRECT_URL_ERROR,
} from '@shared/config'
import { Request, Response } from 'express'
import { asyncWrapper, checkHibp, hashPassword } from '@shared/helpers'
import { newJwtExpiry, createHasuraJwt } from '@shared/jwt'

import Boom from '@hapi/boom'
import { insertAccount, activateAccount, insertTUser } from '@shared/queries'
import { setRefreshToken } from '@shared/cookies'
/*
import { registerSchema } from '@shared/validation'
*/
import { request } from '@shared/request'
import { v4 as uuidv4 } from 'uuid'
import { InsertAccountData, UpdateAccountData, UserData, Session, InsertTUserData } from '@shared/types'
import {} from '@shared/types'

async function listAccount({ body }: Request, res: Response): Promise<unknown> {
  let hasuraData: UpdateAccountData | InsertTUserData
  const useCookie = typeof body.cookie !== 'undefined' ? body.cookie : true

  /*
  const {
    email,
    password,
    user_data = {},
    register_options = {}
  } = await registerSchema.validateAsync(body)
  */

  const {
    password,
    name,
    user_data = {},
    register_options = {},
    email = null,
  } = body

  /*
  if (await selectAccount(body)) {
    throw Boom.badRequest('Account already exists.')
  }
  */

  await checkHibp(password)

  const ticket = uuidv4()
  const now = new Date()
  const ticket_expires_at = new Date()
  ticket_expires_at.setTime(now.getTime() + 60 * 60 * 1000 * 24 * 30) // active for 1 month
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
          data: { email: email, name: name, display_name: name, ...user_data }
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
    display_name: account.user.display_name,
    email: account.email,
    avatar_url: account.user.avatar_url
  }

  const new_ticket = uuidv4()

  try {
    hasuraData = await request<UpdateAccountData>(activateAccount, {
      ticket,
      new_ticket,
      now: new Date()
    })
  } catch (err) /* istanbul ignore next */ {
    console.error(err)
    if (REDIRECT_URL_ERROR) {
      return res.redirect(302, REDIRECT_URL_ERROR as string)
    }
    throw err
  }
  const { affected_rows : update_affected_rows} = hasuraData.update_auth_accounts

  if (!update_affected_rows) {
    console.error('Invalid or expired ticket')

    if (REDIRECT_URL_ERROR) {
      return res.redirect(302, REDIRECT_URL_ERROR as string)
    }
    /* istanbul ignore next */
    throw Boom.unauthorized('Invalid or expired ticket.')
  }

  try {
    hasuraData = await request<InsertTUserData>(insertTUser, {
      name,
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

export default asyncWrapper(listAccount)
