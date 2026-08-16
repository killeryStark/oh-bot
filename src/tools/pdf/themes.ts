import { PdfTheme } from './types';

const COMMON_BASE_CSS = `
  *, *::before, *::after {
    box-sizing: border-box;
  }
  
  .pdf-document-wrapper {
    width: 100%;
    margin: 0;
    padding: 0;
    background-color: #ffffff;
    color: #1a1a1a;
  }

  .pdf-document-body {
    width: 100%;
  }

  h1, h2, h3, h4, h5, h6 {
    page-break-after: avoid;
    break-after: avoid;
  }

  pre, blockquote, table, .callout {
    page-break-inside: avoid;
    break-inside: avoid;
  }

  img {
    max-width: 100%;
    height: auto;
    page-break-inside: avoid;
    break-inside: avoid;
  }
`;

const ANTHROPIC_REPORT_CSS = `
  ${COMMON_BASE_CSS}

  .pdf-theme-anthropic-report {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 13px;
    line-height: 1.65;
    color: #24292f;
  }

  .pdf-theme-anthropic-report .pdf-document-header {
    border-bottom: 2px solid #cc6b49;
    padding-bottom: 14px;
    margin-bottom: 24px;
  }

  .pdf-theme-anthropic-report .pdf-document-title {
    font-size: 24px;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: -0.02em;
    margin: 0 0 6px 0;
    line-height: 1.25;
  }

  .pdf-theme-anthropic-report .pdf-document-meta {
    font-size: 11.5px;
    color: #64748b;
    font-weight: 500;
  }

  .pdf-theme-anthropic-report h1 {
    font-size: 20px;
    font-weight: 700;
    color: #0f172a;
    margin: 24px 0 12px 0;
    padding-bottom: 6px;
    border-bottom: 1px solid #e2e8f0;
    letter-spacing: -0.01em;
  }

  .pdf-theme-anthropic-report h2 {
    font-size: 16px;
    font-weight: 600;
    color: #1e293b;
    margin: 20px 0 10px 0;
    padding-bottom: 4px;
    border-bottom: 1px solid #f1f5f9;
  }

  .pdf-theme-anthropic-report h3 {
    font-size: 14px;
    font-weight: 600;
    color: #334155;
    margin: 16px 0 8px 0;
  }

  .pdf-theme-anthropic-report h4,
  .pdf-theme-anthropic-report h5,
  .pdf-theme-anthropic-report h6 {
    font-size: 13px;
    font-weight: 600;
    color: #475569;
    margin: 14px 0 6px 0;
  }

  .pdf-theme-anthropic-report p {
    margin: 0 0 12px 0;
    color: #334155;
  }

  .pdf-theme-anthropic-report blockquote {
    margin: 14px 0;
    padding: 10px 16px;
    background: #faf8f5;
    border-left: 4px solid #cc6b49;
    border-radius: 0 6px 6px 0;
    color: #3b3a37;
    font-style: normal;
  }

  .pdf-theme-anthropic-report blockquote p:last-child {
    margin-bottom: 0;
  }

  .pdf-theme-anthropic-report .callout {
    margin: 14px 0;
    padding: 12px 16px;
    background: #faf8f5;
    border: 1px solid #f1ece4;
    border-left: 4px solid #cc6b49;
    border-radius: 6px;
    color: #334155;
  }

  .pdf-theme-anthropic-report .callout-title {
    font-weight: 600;
    color: #1e293b;
    margin-bottom: 6px;
    font-size: 13px;
  }

  .pdf-theme-anthropic-report table {
    width: 100%;
    border-collapse: collapse;
    margin: 16px 0;
    font-size: 12px;
    line-height: 1.5;
  }

  .pdf-theme-anthropic-report th {
    background: #f8fafc;
    color: #0f172a;
    font-weight: 600;
    text-align: left;
    padding: 8px 12px;
    border-top: 1px solid #e2e8f0;
    border-bottom: 2px solid #cbd5e1;
  }

  .pdf-theme-anthropic-report td {
    padding: 8px 12px;
    border-bottom: 1px solid #e2e8f0;
    color: #334155;
  }

  .pdf-theme-anthropic-report tbody tr:nth-child(even) {
    background: #f8fafc;
  }

  .pdf-theme-anthropic-report pre {
    background: #1e293b;
    color: #f8fafc;
    padding: 12px 14px;
    border-radius: 6px;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    font-size: 11.5px;
    line-height: 1.5;
    overflow-x: auto;
    margin: 14px 0;
  }

  .pdf-theme-anthropic-report pre code {
    background: transparent;
    color: inherit;
    padding: 0;
    font-size: inherit;
    border-radius: 0;
  }

  .pdf-theme-anthropic-report code {
    background: #f1f5f9;
    color: #0f172a;
    padding: 2px 5px;
    border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    font-size: 0.9em;
  }

  .pdf-theme-anthropic-report ul,
  .pdf-theme-anthropic-report ol {
    margin: 0 0 12px 0;
    padding-left: 20px;
    color: #334155;
  }

  .pdf-theme-anthropic-report li {
    margin-bottom: 4px;
  }

  .pdf-theme-anthropic-report hr {
    border: none;
    border-top: 1px solid #e2e8f0;
    margin: 20px 0;
  }

  .pdf-theme-anthropic-report a {
    color: #cc6b49;
    text-decoration: none;
  }
`;

const ACADEMIC_CSS = `
  ${COMMON_BASE_CSS}

  .pdf-theme-academic {
    font-family: "Georgia", "Times New Roman", Times, "Cambria", serif;
    font-size: 12.5px;
    line-height: 1.7;
    color: #111111;
  }

  .pdf-theme-academic .pdf-document-header {
    text-align: center;
    border-bottom: 1.5px solid #111111;
    padding-bottom: 14px;
    margin-bottom: 24px;
  }

  .pdf-theme-academic .pdf-document-title {
    font-size: 22px;
    font-weight: bold;
    font-family: "Georgia", serif;
    margin: 0 0 6px 0;
    color: #000000;
  }

  .pdf-theme-academic .pdf-document-meta {
    font-size: 11px;
    font-style: italic;
    color: #444444;
  }

  .pdf-theme-academic h1 {
    font-size: 17px;
    font-weight: bold;
    font-family: "Georgia", serif;
    text-align: center;
    margin: 22px 0 12px 0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .pdf-theme-academic h2 {
    font-size: 14.5px;
    font-weight: bold;
    font-family: "Georgia", serif;
    margin: 18px 0 8px 0;
  }

  .pdf-theme-academic h3 {
    font-size: 13px;
    font-weight: bold;
    font-style: italic;
    margin: 14px 0 6px 0;
  }

  .pdf-theme-academic h4,
  .pdf-theme-academic h5,
  .pdf-theme-academic h6 {
    font-size: 12.5px;
    font-weight: bold;
    margin: 12px 0 4px 0;
  }

  .pdf-theme-academic p {
    margin: 0 0 10px 0;
    text-align: justify;
    text-justify: inter-word;
  }

  .pdf-theme-academic blockquote {
    margin: 14px 28px;
    padding: 6px 14px;
    border-left: 2.5px solid #333333;
    font-style: italic;
    color: #222222;
  }

  .pdf-theme-academic .callout {
    margin: 14px 0;
    padding: 10px 14px;
    border: 1px solid #999999;
    background: #fafafa;
  }

  .pdf-theme-academic .callout-title {
    font-weight: bold;
    margin-bottom: 4px;
  }

  .pdf-theme-academic table {
    width: 100%;
    border-collapse: collapse;
    margin: 18px auto;
    font-size: 11.5px;
    line-height: 1.5;
  }

  .pdf-theme-academic th {
    border-top: 1.5px solid #000000;
    border-bottom: 1px solid #000000;
    padding: 6px 10px;
    font-weight: bold;
    text-align: left;
  }

  .pdf-theme-academic td {
    padding: 6px 10px;
    border: none;
  }

  .pdf-theme-academic tbody tr:last-child td {
    border-bottom: 1.5px solid #000000;
  }

  .pdf-theme-academic pre {
    background: #f5f5f5;
    border: 1px solid #cccccc;
    padding: 10px 12px;
    font-family: "Courier New", Courier, monospace;
    font-size: 11px;
    line-height: 1.45;
    margin: 12px 0;
  }

  .pdf-theme-academic pre code {
    background: transparent;
    border: none;
    padding: 0;
  }

  .pdf-theme-academic code {
    font-family: "Courier New", Courier, monospace;
    font-size: 0.92em;
    background: #f0f0f0;
    padding: 1px 3px;
  }

  .pdf-theme-academic ul,
  .pdf-theme-academic ol {
    margin: 0 0 10px 0;
    padding-left: 24px;
  }

  .pdf-theme-academic li {
    margin-bottom: 3px;
  }

  .pdf-theme-academic hr {
    border: none;
    border-top: 1px solid #444444;
    margin: 18px 0;
  }

  .pdf-theme-academic a {
    color: #111111;
    text-decoration: underline;
  }
`;

const MINIMAL_CSS = `
  ${COMMON_BASE_CSS}

  .pdf-theme-minimal {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 12.5px;
    line-height: 1.6;
    color: #000000;
  }

  .pdf-theme-minimal .pdf-document-header {
    border-bottom: 2px solid #000000;
    padding-bottom: 12px;
    margin-bottom: 22px;
  }

  .pdf-theme-minimal .pdf-document-title {
    font-size: 20px;
    font-weight: 800;
    letter-spacing: -0.02em;
    margin: 0 0 4px 0;
    color: #000000;
  }

  .pdf-theme-minimal .pdf-document-meta {
    font-size: 11px;
    color: #555555;
    font-weight: 500;
  }

  .pdf-theme-minimal h1 {
    font-size: 17px;
    font-weight: 700;
    margin: 20px 0 10px 0;
    border-bottom: 1px solid #000000;
    padding-bottom: 4px;
    letter-spacing: -0.01em;
  }

  .pdf-theme-minimal h2 {
    font-size: 14.5px;
    font-weight: 700;
    margin: 16px 0 8px 0;
  }

  .pdf-theme-minimal h3 {
    font-size: 13px;
    font-weight: 700;
    margin: 12px 0 6px 0;
  }

  .pdf-theme-minimal h4,
  .pdf-theme-minimal h5,
  .pdf-theme-minimal h6 {
    font-size: 12px;
    font-weight: 700;
    margin: 10px 0 4px 0;
  }

  .pdf-theme-minimal p {
    margin: 0 0 10px 0;
  }

  .pdf-theme-minimal blockquote {
    margin: 12px 0;
    padding: 6px 12px;
    border-left: 2px solid #000000;
    color: #222222;
  }

  .pdf-theme-minimal .callout {
    margin: 12px 0;
    padding: 10px 12px;
    border: 1px solid #000000;
  }

  .pdf-theme-minimal .callout-title {
    font-weight: 700;
    margin-bottom: 4px;
  }

  .pdf-theme-minimal table {
    width: 100%;
    border-collapse: collapse;
    margin: 14px 0;
    font-size: 11.5px;
  }

  .pdf-theme-minimal th {
    border: 1px solid #000000;
    padding: 6px 10px;
    font-weight: 700;
    text-align: left;
    background: #f4f4f4;
  }

  .pdf-theme-minimal td {
    border: 1px solid #000000;
    padding: 6px 10px;
  }

  .pdf-theme-minimal pre {
    background: #ffffff;
    border: 1px solid #000000;
    padding: 10px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    line-height: 1.45;
    margin: 12px 0;
  }

  .pdf-theme-minimal pre code {
    background: transparent;
    padding: 0;
  }

  .pdf-theme-minimal code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.9em;
    border: 1px solid #cccccc;
    padding: 1px 3px;
  }

  .pdf-theme-minimal ul,
  .pdf-theme-minimal ol {
    margin: 0 0 10px 0;
    padding-left: 20px;
  }

  .pdf-theme-minimal li {
    margin-bottom: 3px;
  }

  .pdf-theme-minimal hr {
    border: none;
    border-top: 1px solid #000000;
    margin: 16px 0;
  }

  .pdf-theme-minimal a {
    color: #000000;
    text-decoration: underline;
  }
`;

const RAW_CSS = `
  ${COMMON_BASE_CSS}

  .pdf-theme-raw {
    font-family: sans-serif;
    font-size: 12px;
    line-height: 1.5;
    color: #000000;
  }

  .pdf-theme-raw .pdf-document-header {
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid #ccc;
  }

  .pdf-theme-raw .pdf-document-title {
    font-size: 18px;
    font-weight: bold;
    margin: 0 0 4px 0;
  }

  .pdf-theme-raw .pdf-document-meta {
    font-size: 10px;
    color: #666;
  }

  .pdf-theme-raw table {
    width: 100%;
    border-collapse: collapse;
    margin: 10px 0;
  }

  .pdf-theme-raw th,
  .pdf-theme-raw td {
    border: 1px solid #ccc;
    padding: 4px 8px;
  }

  .pdf-theme-raw pre {
    background: #f0f0f0;
    padding: 8px;
    margin: 10px 0;
    font-family: monospace;
    font-size: 11px;
  }

  .pdf-theme-raw code {
    font-family: monospace;
  }
`;

export function getThemeCss(theme: PdfTheme = 'anthropic-report'): string {
  switch (theme) {
    case 'academic':
      return ACADEMIC_CSS;
    case 'minimal':
      return MINIMAL_CSS;
    case 'raw':
      return RAW_CSS;
    case 'anthropic-report':
    default:
      return ANTHROPIC_REPORT_CSS;
  }
}
