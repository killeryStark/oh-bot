import { App } from 'obsidian';
import { AgentTool } from '../base';
import { HarnessSettings, ToolResult, ToolSchema } from '../../types';
import { PdfOrientation, PdfPageSize, PdfTheme } from './types';
import { generatePdf } from './generator';

export class GeneratePdfTool extends AgentTool {
  name = 'generate_pdf';
  description = 'Generate a styled PDF document and save it directly into the Obsidian Vault.';

  parameters: ToolSchema['parameters'] = {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: "Target file path in the Vault (e.g., 'Reports/Market_Analysis.pdf').",
      },
      content: {
        type: 'string',
        description: 'The HTML or Markdown content to render into the PDF document.',
      },
      title: {
        type: 'string',
        description: 'Optional title for document header and cover page.',
      },
      theme: {
        type: 'string',
        enum: ['anthropic-report', 'academic', 'minimal', 'raw'],
        description: "Visual typography and layout theme (default: 'anthropic-report').",
      },
      pageSize: {
        type: 'string',
        enum: ['a4', 'letter'],
        description: "Page size format (default: 'a4').",
      },
      orientation: {
        type: 'string',
        enum: ['portrait', 'landscape'],
        description: "Page orientation (default: 'portrait').",
      },
    },
    required: ['filePath', 'content'],
  };

  isMutation = true;

  private settings?: HarnessSettings;

  setSettings(settings: HarnessSettings): void {
    this.settings = settings;
  }

  async execute(
    args: {
      filePath: string;
      content: string;
      title?: string;
      theme?: PdfTheme;
      pageSize?: PdfPageSize;
      orientation?: PdfOrientation;
    },
    app: App
  ): Promise<ToolResult> {
    try {
      let filePath = (args?.filePath || '').trim();
      if (filePath && !filePath.includes('/') && !filePath.includes('\\') && this.settings?.defaultPdfFolder) {
        const folder = this.settings.defaultPdfFolder.replace(/^[\\\/]+|[\\\/]+$/g, '');
        if (folder) {
          filePath = `${folder}/${filePath}`;
        }
      }
      const content = args?.content;

      if (!filePath) {
        return {
          success: false,
          output: '',
          error: 'Missing required parameter: "filePath" is required.',
        };
      }

      if (content === undefined || content === null || (typeof content === 'string' && !content.trim())) {
        return {
          success: false,
          output: '',
          error: 'Missing required parameter: "content" is required.',
        };
      }

      const result = await generatePdf(
        {
          filePath,
          content,
          title: args.title,
          theme: args.theme,
          pageSize: args.pageSize,
          orientation: args.orientation,
        },
        app
      );

      const formattedSize = result.sizeBytes.toLocaleString();
      const pagesText = result.pagesCount > 1 ? `${result.pagesCount} pages` : '1 page';

      return {
        success: true,
        output: `Successfully generated PDF at "${result.filePath}" (Size: ${formattedSize} bytes, ${pagesText}).`,
      };
    } catch (e: any) {
      return {
        success: false,
        output: '',
        error: `Error generating PDF: ${e?.message || String(e)}`,
      };
    }
  }
}
