import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export const registerPrompt = (server: McpServer) => {
  server.prompt(
    'init',
    async (extra) => {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `You can use checkpoint features by inserting '<meta name="__mcp_checkpoint" data-id="">' into the head to create a named snapshot of the current state.
The data-id attribute is a unique identifier for the checkpoint.
Console logs generated in the browser while a checkpoint is active are tagged with the checkpoint ID and can be queried individually.
Note: Since hot reload is triggered when files are saved, carefully consider the sequence between meta tag changes and the changes you want to observe. Make sure to set the checkpoint meta tag before making the changes you want to track.
You can use the capture-screenshot tool to take screenshots. The captured screenshots are stored in the @.mcp_screenshots/ directory.`,
            }
          }
        ]
      };
    }
  );
};
