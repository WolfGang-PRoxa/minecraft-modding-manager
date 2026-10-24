// Serveur MCP (stdio) : chaque commande du registre devient un outil, que Claude Code appelle avec les mêmes
// paramètres que la ligne de commande. Rien d'autre que le protocole ne doit sortir sur stdout.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { version } from '../../package.json'
import { MCP_SERVER_NAME } from '../core/maintenance/claude'
import { APP_NAME } from '../shared/config'
import { COMMANDS } from '../core/commands'
import type { createCommandRuntime } from '../core/commands/context'
import { toolName } from '../core/commands/registry'
import { describeError } from '../core/studio/analyze'
import { MCP_INSTRUCTIONS } from './instructions'

type Runtime = Awaited<ReturnType<typeof createCommandRuntime>>

export async function startMcpServer(runtime: Runtime): Promise<void> {
  const server = new McpServer({ name: MCP_SERVER_NAME, title: APP_NAME, version }, { instructions: MCP_INSTRUCTIONS })

  for (const command of COMMANDS) {
    server.registerTool(
      toolName(command),
      {
        title: command.summary,
        description: [command.summary, command.description].filter(Boolean).join('\n\n'),
        inputSchema: command.params,
        annotations: {
          readOnlyHint: command.kind === 'read',
          destructiveHint: command.kind === 'destructive',
          openWorldHint: false
        }
      },
      async (args, extra) => {
        const token = extra._meta?.progressToken
        let last = 0
        const context = runtime.context({
          signal: extra.signal,
          progress: (message, done, total) => {
            const now = Date.now()
            if (token === undefined || now - last < 500) return
            last = now
            void extra
              .sendNotification({
                method: 'notifications/progress',
                params: { progressToken: token, progress: done ?? 0, total, message }
              })
              .catch(() => {})
          }
        })
        try {
          const result = await command.run(args as never, context)
          return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? null, null, 2) }] }
        } catch (err) {
          return { isError: true, content: [{ type: 'text' as const, text: describeError(err) }] }
        }
      }
    )
  }

  await server.connect(new StdioServerTransport())
}
