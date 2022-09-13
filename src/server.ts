import { COOKIE_SECRET, AUTH_HAS_ONE_PROVIDER } from '@shared/config'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import { errors } from './errors'
import express from 'express'
import fileUpload from 'express-fileupload'
import helmet from 'helmet'
import { json, urlencoded } from 'body-parser'
import morgan from 'morgan'
import { limiter } from './limiter'
import router from './routes'
import passport from 'passport'
import { authMiddleware } from './middlewares/auth'

const app = express()

if (process.env.NODE_ENV === 'production') {
  app.use(limiter)
}

app.use(
  morgan(
    ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length]'
  )
)
app.use(helmet())
app.use(json({ limit: '50mb' }))
app.use(urlencoded({ extended: true, limit: '50mb' }))
app.use(
  fileUpload({
    limits: { fieldNameSize: 200, fieldSize: 50 * 1024 * 1024, fileSize: 50 * 1024 * 1024 },
    abortOnLimit: true
  })
)
app.use(cors({ credentials: true, origin: true }))

if (AUTH_HAS_ONE_PROVIDER) {
  app.use(passport.initialize())
}

/**
 * Set a cookie secret to enable server validation of cookies.
 */
if (COOKIE_SECRET) {
  app.use(cookieParser(COOKIE_SECRET))
} else {
  app.use(cookieParser())
}

app.use(authMiddleware)
app.use(router)
app.use(errors)

export { app }
