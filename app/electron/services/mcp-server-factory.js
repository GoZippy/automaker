const { createSdkMcpServer, tool } = require("@anthropic-ai/claude-agent-sdk");
const { z } = require("zod");
const featureLoader = require("./feature-loader");

/**
 * MCP Server Factory - Creates custom MCP servers with tools
 */
class McpServerFactory {
  /**
   * Create a custom MCP server with the UpdateFeatureStatus tool
   * This tool allows Claude Code to safely update feature status without
   * directly modifying the feature_list.json file, preventing race conditions
   * and accidental state restoration.
   */
  createFeatureToolsServer(updateFeatureStatusCallback, projectPath) {
    return createSdkMcpServer({
      name: "automaker-tools",
      version: "1.0.0",
      tools: [
        tool(
          "UpdateFeatureStatus",
          "Update the status of a feature in the feature list. Use this tool instead of directly modifying feature_list.json to safely update feature status. IMPORTANT: If the feature has skipTests=true, you should NOT mark it as verified - instead it will automatically go to waiting_approval status for manual review. Always include a summary of what was done.",
          {
            featureId: z.string().describe("The ID of the feature to update"),
            status: z.enum(["backlog", "in_progress", "verified"]).describe("The new status for the feature. Note: If skipTests=true, verified will be converted to waiting_approval automatically."),
            summary: z.string().optional().describe("A brief summary of what was implemented/changed. This will be displayed on the Kanban card. Example: 'Added dark mode toggle. Modified: settings.tsx, theme-provider.tsx'")
          },
          async (args) => {
            try {
              console.log(`[McpServerFactory] UpdateFeatureStatus tool called: featureId=${args.featureId}, status=${args.status}, summary=${args.summary || "(none)"}`);

              // Load the feature to check skipTests flag
              const features = await featureLoader.loadFeatures(projectPath);
              const feature = features.find((f) => f.id === args.featureId);

              if (!feature) {
                throw new Error(`Feature ${args.featureId} not found`);
              }

              // If agent tries to mark as verified but feature has skipTests=true, convert to waiting_approval
              let finalStatus = args.status;
              if (args.status === "verified" && feature.skipTests === true) {
                console.log(`[McpServerFactory] Feature ${args.featureId} has skipTests=true, converting verified -> waiting_approval`);
                finalStatus = "waiting_approval";
              }

              // Call the provided callback to update feature status with summary
              await updateFeatureStatusCallback(args.featureId, finalStatus, projectPath, args.summary);

              const statusMessage = finalStatus !== args.status
                ? `Successfully updated feature ${args.featureId} to status "${finalStatus}" (converted from "${args.status}" because skipTests=true)${args.summary ? ` with summary: "${args.summary}"` : ""}`
                : `Successfully updated feature ${args.featureId} to status "${finalStatus}"${args.summary ? ` with summary: "${args.summary}"` : ""}`;

              return {
                content: [{
                  type: "text",
                  text: statusMessage
                }]
              };
            } catch (error) {
              console.error("[McpServerFactory] UpdateFeatureStatus tool error:", error);
              return {
                content: [{
                  type: "text",
                  text: `Failed to update feature status: ${error.message}`
                }]
              };
            }
          }
        )
      ]
    });
  }
}

module.exports = new McpServerFactory();
