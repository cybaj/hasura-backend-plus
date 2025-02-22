import { Request, Response } from 'express'
import Boom from '@hapi/boom'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { asyncWrapper, selectAccount } from '@shared/helpers'
import { createHasuraJwt, newJwtExpiry } from '@shared/jwt'
import { setRefreshToken } from '@shared/cookies'
import { loginAnonymouslySchema, loginSchema } from '@shared/validation'
import { insertAccount } from '@shared/queries'
import { request } from '@shared/request'
import { AccountData, UserData, Session } from '@shared/types'
import { ANONYMOUS_USERS_ENABLE, DEFAULT_ANONYMOUS_ROLE } from '@shared/config'

interface HasuraData {
  insert_auth_accounts: {
    affected_rows: number
    returning: AccountData[]
  }
}

async function loginAccount({ body }: Request, res: Response): Promise<unknown> {
  // default to true
  const useCookie = typeof body.cookie !== 'undefined' ? body.cookie : true

  if (ANONYMOUS_USERS_ENABLE) {
    const { anonymous } = await loginAnonymouslySchema.validateAsync(body)

    // if user tries to sign in anonymously
    if (anonymous) {
      let hasura_data: HasuraData
      try {
        const ticket = uuidv4()
        hasura_data = await request(insertAccount, {
          account: {
            email: null,
            password_hash: null,
            ticket,
            active: true,
            is_anonymous: true,
            default_role: DEFAULT_ANONYMOUS_ROLE,
            account_roles: {
              data: [{ role: DEFAULT_ANONYMOUS_ROLE }]
            },
            user: {
              data: { display_name: 'Anonymous user' }
            }
          }
        })
      } catch (error) {
        throw Boom.badImplementation('Unable to create user and sign in user anonymously')
      }

      if (!hasura_data.insert_auth_accounts.returning.length) {
        throw Boom.badImplementation('Unable to create user and sign in user anonymously')
      }

      const account = hasura_data.insert_auth_accounts.returning[0]

      const refresh_token = await setRefreshToken(res, account.id, useCookie)

      const jwt_token = createHasuraJwt(account)
      const jwt_expires_in = newJwtExpiry

      const session: Session = { jwt_token, jwt_expires_in, user: account.user }
      if (useCookie) session.refresh_token = refresh_token

      return res.send(session)
    }
  }

  // else, login users normally
  const { password } = await loginSchema.validateAsync(body)

  const account = await selectAccount(body)

  if (!account) {
    throw Boom.badRequest('Account does not exist.')
  }

  const { id, mfa_enabled, password_hash, active, ticket } = account

  if (!active) {
    throw Boom.badRequest('Account is not activated.')
  }

  if (!(await bcrypt.compare(password, password_hash))) {
    throw Boom.unauthorized('Username and password do not match')
  }

  if (mfa_enabled) {
    return res.send({ mfa: true, ticket })
  }

  // refresh_token
  const refresh_token = await setRefreshToken(res, id, useCookie)

  // generate JWT
  const jwt_token = createHasuraJwt(account)
  const jwt_expires_in = newJwtExpiry
  const user: UserData = {
    id: account.user.id,
    display_name: account.user.display_name,
    name: account.user.name,
    email: account.email,
    avatar_url: account.user.avatar_url,
    phone_number: account.user.phone_number,
  }
  const session: Session = { jwt_token, jwt_expires_in, user }
  if (!useCookie) session.refresh_token = refresh_token

  res.send(session)
}

export default asyncWrapper(loginAccount)

