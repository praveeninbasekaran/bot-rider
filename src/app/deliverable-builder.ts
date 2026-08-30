import { attachmentsOf, type BotAttachment, type BotRecord } from '../domain/bot';
import type { ChangeFile } from '../domain/changeset';
import type { DeliverableFormat, DeliverableSpec } from '../domain/deliverable';

export class DeliverableBuilder {
  static build(spec: DeliverableSpec, template?: string): ChangeFile {
    if (spec.format === 'html') {
      const html = buildHtml(spec, template);
      return {
        path: spec.path,
        op: 'create',
        content: html,
        kind: 'html-preview',
      };
    }
    const bytes = buildOffice(spec);
    return {
      path: spec.path,
      op: 'create',
      content: '',
      binary: bytes,
      kind: 'office-binary',
    };
  }
}

export function looksLikeHtml(text: string): boolean {
  const src = text.replace(/^\uFEFF/, '').trimStart();
  if (/^<!DOCTYPE\s+html\b/i.test(src) || /^<html[\s>]/i.test(src)) {
    return true;
  }
  return /<html[\s>]/i.test(src) && /<\/html>/i.test(src);
}

/** HTML snapshot only when format is html and the attachment already looks like HTML. */
export function templateForBot(bot: BotRecord | undefined, format: DeliverableFormat): string | undefined {
  if (!bot || format !== 'html') {
    return undefined;
  }
  for (const att of attachmentsOf(bot)) {
    if (att.snapshot && looksLikeHtml(att.snapshot)) {
      return att.snapshot;
    }
  }
  return undefined;
}

export function isHtmlAttachment(att: BotAttachment): boolean {
  return !!att.snapshot && looksLikeHtml(att.snapshot);
}

function buildHtml(spec: DeliverableSpec, template?: string): string {
  const sections = spec.outline.length ? spec.outline : [spec.title];
  const facts = spec.facts ?? [];
  const body = sections
    .map((heading, index) => {
      const fact = facts[index] ? `<p>${escapeHtml(facts[index]!)}</p>` : '';
      const extra =
        index === 0 && facts.length > sections.length
          ? facts
              .slice(sections.length)
              .map((line) => `<p>${escapeHtml(line)}</p>`)
              .join('')
          : '';
      return `<section><h2>${escapeHtml(heading)}</h2>${fact}${extra}</section>`;
    })
    .join('\n');

  if (template && looksLikeHtml(template)) {
    return mergeHtmlTemplate(template, spec, body);
  }

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8" />',
    `<title>${escapeHtml(spec.title)}</title>`,
    '</head>',
    '<body>',
    `<h1>${escapeHtml(spec.title)}</h1>`,
    body,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

function mergeHtmlTemplate(template: string, spec: DeliverableSpec, sectionsHtml: string): string {
  const injection = `\n<main data-botrider-deliverable="1">\n<h1>${escapeHtml(spec.title)}</h1>\n${sectionsHtml}\n</main>\n`;
  if (/<\/body>/i.test(template)) {
    return template.replace(/<\/body>/i, `${injection}</body>`);
  }
  return `${template.trim()}\n${injection}`;
}

function buildOffice(spec: DeliverableSpec): Uint8Array {
  if (spec.format === 'docx') {
    return zipStore(docxParts(spec));
  }
  if (spec.format === 'xlsx') {
    return zipStore(xlsxParts(spec));
  }
  return zipStore(pptxParts(spec));
}

function docxParts(spec: DeliverableSpec): ZipPart[] {
  const headings = spec.outline.length ? spec.outline : [spec.title];
  const facts = spec.facts ?? [];
  const paras: string[] = [wPara(spec.title, true)];
  for (let i = 0; i < headings.length; i++) {
    paras.push(wPara(headings[i]!, true));
    if (facts[i]) {
      paras.push(wPara(facts[i]!));
    }
  }
  for (const fact of facts.slice(headings.length)) {
    paras.push(wPara(fact));
  }
  paras.push('<w:sectPr/>');

  return [
    {
      name: '[Content_Types].xml',
      text: xml(
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
          `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
          `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
          `</Types>`,
      ),
    },
    {
      name: '_rels/.rels',
      text: rels([
        { id: 'rId1', type: 'officeDocument', target: 'word/document.xml' },
        { id: 'rId2', type: 'core-properties', target: 'docProps/core.xml' },
        { id: 'rId3', type: 'extended-properties', target: 'docProps/app.xml' },
      ]),
    },
    {
      name: 'word/document.xml',
      text: xml(
        `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
          `<w:body>${paras.join('')}</w:body></w:document>`,
      ),
    },
    { name: 'word/_rels/document.xml.rels', text: rels([]) },
    { name: 'docProps/core.xml', text: coreXml(spec.title) },
    { name: 'docProps/app.xml', text: appXml('Word') },
  ];
}

function xlsxParts(spec: DeliverableSpec): ZipPart[] {
  const sheets = spec.outline.length ? spec.outline : [spec.title];
  const facts = spec.facts ?? [];
  const sheetParts: ZipPart[] = [];
  const workbookSheets: string[] = [];
  const workbookRels: Rel[] = [];

  for (let i = 0; i < sheets.length; i++) {
    const n = i + 1;
    const rows = [xRow(1, sheets[i]!), ...(facts[i] ? [xRow(2, facts[i]!)] : [])];
    if (i === 0) {
      for (let f = sheets.length; f < facts.length; f++) {
        rows.push(xRow(rows.length + 1, facts[f]!));
      }
    }
    sheetParts.push({
      name: `xl/worksheets/sheet${n}.xml`,
      text: xml(
        `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
          `<sheetData>${rows.join('')}</sheetData></worksheet>`,
      ),
    });
    workbookSheets.push(`<sheet name="${escapeXmlAttr(sheetName(sheets[i]!, n))}" sheetId="${n}" r:id="rId${n}"/>`);
    workbookRels.push({
      id: `rId${n}`,
      type: 'worksheet',
      target: `worksheets/sheet${n}.xml`,
    });
  }

  return [
    {
      name: '[Content_Types].xml',
      text: xml(
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
          sheets
            .map(
              (_, i) =>
                `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
            )
            .join('') +
          `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
          `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
          `</Types>`,
      ),
    },
    {
      name: '_rels/.rels',
      text: rels([
        { id: 'rId1', type: 'officeDocument', target: 'xl/workbook.xml' },
        { id: 'rId2', type: 'core-properties', target: 'docProps/core.xml' },
        { id: 'rId3', type: 'extended-properties', target: 'docProps/app.xml' },
      ]),
    },
    {
      name: 'xl/workbook.xml',
      text: xml(
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
          `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
          `<sheets>${workbookSheets.join('')}</sheets></workbook>`,
      ),
    },
    { name: 'xl/_rels/workbook.xml.rels', text: rels(workbookRels) },
    ...sheetParts,
    { name: 'docProps/core.xml', text: coreXml(spec.title) },
    { name: 'docProps/app.xml', text: appXml('Excel') },
  ];
}

function pptxParts(spec: DeliverableSpec): ZipPart[] {
  const slides = spec.outline.length ? spec.outline : [spec.title];
  const facts = spec.facts ?? [];
  const slideFiles: ZipPart[] = [];
  const presRels: Rel[] = [
    { id: 'rId1', type: 'slideMaster', target: 'slideMasters/slideMaster1.xml' },
  ];
  const sldIdLst: string[] = [];

  for (let i = 0; i < slides.length; i++) {
    const n = i + 1;
    const rid = `rId${n + 1}`;
    presRels.push({ id: rid, type: 'slide', target: `slides/slide${n}.xml` });
    sldIdLst.push(`<p:sldId id="${255 + n}" r:id="${rid}"/>`);
    const body = facts[i] ?? '';
    slideFiles.push({
      name: `ppt/slides/slide${n}.xml`,
      text: slideXml(slides[i]!, body),
    });
    slideFiles.push({
      name: `ppt/slides/_rels/slide${n}.xml.rels`,
      text: rels([{ id: 'rId1', type: 'slideLayout', target: '../slideLayouts/slideLayout1.xml' }]),
    });
  }

  return [
    {
      name: '[Content_Types].xml',
      text: xml(
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>` +
          slides
            .map(
              (_, i) =>
                `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
            )
            .join('') +
          `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>` +
          `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>` +
          `<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>` +
          `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
          `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
          `</Types>`,
      ),
    },
    {
      name: '_rels/.rels',
      text: rels([
        { id: 'rId1', type: 'officeDocument', target: 'ppt/presentation.xml' },
        { id: 'rId2', type: 'core-properties', target: 'docProps/core.xml' },
        { id: 'rId3', type: 'extended-properties', target: 'docProps/app.xml' },
      ]),
    },
    {
      name: 'ppt/presentation.xml',
      text: xml(
        `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ` +
          `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
          `<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>` +
          `<p:sldIdLst>${sldIdLst.join('')}</p:sldIdLst>` +
          `<p:sldSz cx="9144000" cy="6858000"/>` +
          `<p:notesSz cx="6858000" cy="9144000"/>` +
          `</p:presentation>`,
      ),
    },
    { name: 'ppt/_rels/presentation.xml.rels', text: rels(presRels) },
    ...slideFiles,
    { name: 'ppt/slideLayouts/slideLayout1.xml', text: slideLayoutXml() },
    {
      name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
      text: rels([{ id: 'rId1', type: 'slideMaster', target: '../slideMasters/slideMaster1.xml' }]),
    },
    { name: 'ppt/slideMasters/slideMaster1.xml', text: slideMasterXml() },
    {
      name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels',
      text: rels([
        { id: 'rId1', type: 'slideLayout', target: '../slideLayouts/slideLayout1.xml' },
        { id: 'rId2', type: 'theme', target: '../theme/theme1.xml' },
      ]),
    },
    { name: 'ppt/theme/theme1.xml', text: themeXml() },
    { name: 'docProps/core.xml', text: coreXml(spec.title) },
    { name: 'docProps/app.xml', text: appXml('PowerPoint') },
  ];
}

type Rel = { id: string; type: string; target: string };
type ZipPart = { name: string; text: string };

const REL_NS = {
  officeDocument: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
  'core-properties': 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
  'extended-properties': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties',
  worksheet: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet',
  slide: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide',
  slideLayout: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout',
  slideMaster: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster',
  theme: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme',
} as const;

function rels(items: Rel[]): string {
  const body = items
    .map((item) => {
      const type = REL_NS[item.type as keyof typeof REL_NS] ?? item.type;
      return `<Relationship Id="${item.id}" Type="${type}" Target="${escapeXmlAttr(item.target)}"/>`;
    })
    .join('');
  return xml(
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${body}</Relationships>`,
  );
}

function coreXml(title: string): string {
  return xml(
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
      `xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ` +
      `xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
      `<dc:title>${escapeXml(title)}</dc:title>` +
      `<dc:creator>Bot Rider</dc:creator>` +
      `</cp:coreProperties>`,
  );
}

function appXml(app: string): string {
  return xml(
    `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">` +
      `<Application>${escapeXml(app)}</Application></Properties>`,
  );
}

function wPara(text: string, heading = false): string {
  const inner = `<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
  if (heading) {
    return `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${inner}</w:p>`;
  }
  return `<w:p>${inner}</w:p>`;
}

function xRow(n: number, text: string): string {
  return `<row r="${n}"><c r="A${n}" t="inlineStr"><is><t>${escapeXml(text)}</t></is></c></row>`;
}

function sheetName(raw: string, n: number): string {
  const cleaned = raw.replace(/[\\/?*[\]]/g, ' ').replace(/\s+/g, ' ').trim() || `Sheet${n}`;
  return cleaned.slice(0, 31);
}

function slideXml(title: string, body: string): string {
  return xml(
    `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ` +
      `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
      `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<p:cSld><p:spTree>` +
      `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
      `<p:grpSpPr/>` +
      textShape(2, title, 400000, 200000, 8340000, 1000000) +
      textShape(3, body, 400000, 1400000, 8340000, 4000000) +
      `</p:spTree></p:cSld></p:sld>`,
  );
}

function textShape(id: number, text: string, x: number, y: number, cx: number, cy: number): string {
  return (
    `<p:sp>` +
    `<p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
    `<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${escapeXml(text)}</a:t></a:r></a:p></p:txBody>` +
    `</p:sp>`
  );
}

function slideLayoutXml(): string {
  return xml(
    `<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ` +
      `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" type="blank">` +
      `<p:cSld name="Blank"><p:spTree>` +
      `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
      `<p:grpSpPr/>` +
      `</p:spTree></p:cSld></p:sldLayout>`,
  );
}

function slideMasterXml(): string {
  return xml(
    `<p:sldMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ` +
      `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
      `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<p:cSld><p:spTree>` +
      `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
      `<p:grpSpPr/>` +
      `</p:spTree></p:cSld>` +
      `<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>` +
      `<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>` +
      `</p:sldMaster>`,
  );
}

function themeXml(): string {
  return xml(
    `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office">` +
      `<a:themeElements>` +
      `<a:clrScheme name="Office">` +
      `<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>` +
      `<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>` +
      `<a:dk2><a:srgbClr val="44546A"/></a:dk2>` +
      `<a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>` +
      `<a:accent1><a:srgbClr val="4472C4"/></a:accent1>` +
      `<a:accent2><a:srgbClr val="ED7D31"/></a:accent2>` +
      `<a:accent3><a:srgbClr val="A5A5A5"/></a:accent3>` +
      `<a:accent4><a:srgbClr val="FFC000"/></a:accent4>` +
      `<a:accent5><a:srgbClr val="5B9BD5"/></a:accent5>` +
      `<a:accent6><a:srgbClr val="70AD47"/></a:accent6>` +
      `<a:hlink><a:srgbClr val="0563C1"/></a:hlink>` +
      `<a:folHlink><a:srgbClr val="954F72"/></a:folHlink>` +
      `</a:clrScheme>` +
      `<a:fontScheme name="Office">` +
      `<a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>` +
      `<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>` +
      `</a:fontScheme>` +
      `<a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>` +
      `<a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>` +
      `<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>` +
      `<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>` +
      `</a:fmtScheme>` +
      `</a:themeElements>` +
      `</a:theme>`,
  );
}

function xml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${body}`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeXmlAttr(text: string): string {
  return escapeXml(text).replace(/"/g, '&quot;');
}

function escapeHtml(text: string): string {
  return escapeXml(text).replace(/"/g, '&quot;');
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStore(parts: ZipPart[]): Uint8Array {
  const encoder = new TextEncoder();
  const files = parts.map((part) => {
    const data = encoder.encode(part.text);
    return { name: part.name.replace(/\\/g, '/'), data, crc: crc32(data) };
  });

  const chunks: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, 0, true);
    lv.setUint32(14, file.crc, true);
    lv.setUint32(18, file.data.length, true);
    lv.setUint32(22, file.data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    chunks.push(local, file.data);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint32(16, file.crc, true);
    cv.setUint32(20, file.data.length, true);
    cv.setUint32(24, file.data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);
    offset += local.length + file.data.length;
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const total = offset + centralSize + eocd.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const chunk of chunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  for (const central of centrals) {
    out.set(central, pos);
    pos += central.length;
  }
  out.set(eocd, pos);
  return out;
}
