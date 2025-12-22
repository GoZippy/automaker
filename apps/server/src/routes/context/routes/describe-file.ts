/**
 * POST /context/describe-file endpoint - Generate description for a text file
 *
 * Uses Claude Haiku to analyze a text file and generate a concise description
 * suitable for context file metadata.
 */

import type { Request, Response } from 'express';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { createLogger } from '@automaker/utils';
import { CLAUDE_MODEL_MAP } from '@automaker/types';

const logger = createLogger('DescribeFile');

/**
 * Request body for the describe-file endpoint
 */
interface DescribeFileRequestBody {
  /** Path to the file */
  filePath: string;
}

/**
 * Success response from the describe-file endpoint
 */
interface DescribeFileSuccessResponse {
  success: true;
  description: string;
}

/**
 * Error response from the describe-file endpoint
 */
interface DescribeFileErrorResponse {
  success: false;
  error: string;
}

/**
 * Extract text content from Claude SDK response messages
 */
async function extractTextFromStream(
  stream: AsyncIterable<{
    type: string;
    subtype?: string;
    result?: string;
    message?: {
      content?: Array<{ type: string; text?: string }>;
    };
  }>
): Promise<string> {
  let responseText = '';

  for await (const msg of stream) {
    if (msg.type === 'assistant' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === 'text' && block.text) {
          responseText += block.text;
        }
      }
    } else if (msg.type === 'result' && msg.subtype === 'success') {
      responseText = msg.result || responseText;
    }
  }

  return responseText;
}

/**
 * Create the describe-file request handler
 *
 * @returns Express request handler for file description
 */
export function createDescribeFileHandler(): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { filePath } = req.body as DescribeFileRequestBody;

      // Validate required fields
      if (!filePath || typeof filePath !== 'string') {
        const response: DescribeFileErrorResponse = {
          success: false,
          error: 'filePath is required and must be a string',
        };
        res.status(400).json(response);
        return;
      }

      logger.info(`[DescribeFile] Starting description generation for: ${filePath}`);

      // Build prompt that explicitly asks to read and describe the file
      const prompt = `Read the file at "${filePath}" and describe what it contains.

After reading the file, provide a 1-2 sentence description suitable for use as context in an AI coding assistant. Focus on what the file contains, its purpose, and why an AI agent might want to use this context in the future (e.g., "API documentation for the authentication endpoints", "Configuration file for database connections", "Coding style guidelines for the project").

Respond with ONLY the description text, no additional formatting, preamble, or explanation.`;

      // Use Claude SDK query function - needs 3+ turns for: tool call, tool result, response
      const stream = query({
        prompt,
        options: {
          model: CLAUDE_MODEL_MAP.haiku,
          maxTurns: 3,
          allowedTools: ['Read'],
          permissionMode: 'acceptEdits',
        },
      });

      // Extract the description from the response
      const description = await extractTextFromStream(stream);

      if (!description || description.trim().length === 0) {
        logger.warn('Received empty response from Claude');
        const response: DescribeFileErrorResponse = {
          success: false,
          error: 'Failed to generate description - empty response',
        };
        res.status(500).json(response);
        return;
      }

      logger.info(`Description generated, length: ${description.length} chars`);

      const response: DescribeFileSuccessResponse = {
        success: true,
        description: description.trim(),
      };
      res.json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error('File description failed:', errorMessage);

      const response: DescribeFileErrorResponse = {
        success: false,
        error: errorMessage,
      };
      res.status(500).json(response);
    }
  };
}
