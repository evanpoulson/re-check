import { setupServer } from 'msw/node'
import { handlers } from './handlers'

/** Node server for tests. Same handlers as the browser worker. */
export const server = setupServer(...handlers)
