import { Request, Response } from 'express'
import Boom from '@hapi/boom'
import bcrypt from 'bcryptjs'
import { asyncWrapper, selectAccount2 } from '@shared/helpers'
import { newJwtExpiry, createHasuraJwt } from '@shared/jwt'
import { setRefreshToken } from '@shared/cookies'
import { UserData, Session } from '@shared/types'

async function loginNameAccount({ body }: Request, res: Response): Promise<unknown> {
  // default to true
  const useCookie = typeof body.cookie !== 'undefined' ? body.cookie : true

  // else, login users normally
  const { password } = body

  const account = await selectAccount2(body)

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
    avatar_url: account.user.avatar_url
  }
  const session: Session = { jwt_token, jwt_expires_in, user }
  if (!useCookie) session.refresh_token = refresh_token

  res.send(session)
}

export default asyncWrapper(loginNameAccount)
