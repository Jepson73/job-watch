// Node: Code "Create Word file"
// Mode: Run Once for All Items
// Builds a real .docx file (opens in Word, LibreOffice and Google Docs) and attaches it in the binary field "data".
// No libraries needed: the file is a small uncompressed zip of WordprocessingML parts.

const item = $input.first().json;
const b = item.letter;

// No letter = no attachment, the email is still sent
if (!b) return [{ json: item }];

// ---------- XML ----------
const x = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const para = (text, { bold = false, size = null, right = false, after = 160 } = {}) => {
  const rpr = [bold ? '<w:b/>' : '', size ? `<w:sz w:val="${size}"/>` : ''].join('');
  return `<w:p><w:pPr><w:spacing w:after="${after}"/>${right ? '<w:jc w:val="right"/>' : ''}</w:pPr>`
    + `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${x(text)}</w:t></w:r></w:p>`;
};

const lines = (list, right) => list.filter(Boolean).map(t => para(t, { right, after: 0 })).join('');

const noBorders = '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>';

const header = `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>${noBorders}</w:tblPr>`
  + `<w:tblGrid><w:gridCol w:w="4800"/><w:gridCol w:w="4800"/></w:tblGrid><w:tr>`
  + `<w:tc><w:tcPr><w:tcW w:w="2500" w:type="pct"/></w:tcPr>${lines([b.name, b.town, b.phone, b.email], false)}</w:tc>`
  + `<w:tc><w:tcPr><w:tcW w:w="2500" w:type="pct"/></w:tcPr>${lines([b.employer, `${b.town} ${b.date}`], true)}</w:tc>`
  + `</w:tr></w:tbl>`;

const body = [
  header,
  para('', { after: 240 }),
  para(`${b.application}: ${b.title}`, { bold: true, size: 28, after: b.reference ? 0 : 240 }),
  b.reference ? para(`${b.referenceLabel}: ${b.reference}`, { after: 240 }) : '',
  para(b.hello),
  ...(b.paragraphs || []).map(s => para(s)),
  para(b.regards, { after: 0 }),
  para(b.name)
].join('');

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`;

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="23"/><w:szCs w:val="23"/><w:lang w:val="${b.language === 'en' ? 'en-GB' : 'sv-SE'}"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`;

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;

const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

// ---------- Minimal zip (stored, no compression) ----------
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = buf => {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
};

const zip = files => {
  const parts = [], directory = [];
  let offset = 0;
  for (const [name, content] of files) {
    const n = Buffer.from(name, 'utf8');
    const d = Buffer.from(content, 'utf8');
    const crc = crc32(d);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8); local.writeUInt16LE(0, 10); local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(d.length, 18); local.writeUInt32LE(d.length, 22);
    local.writeUInt16LE(n.length, 26); local.writeUInt16LE(0, 28);
    parts.push(local, n, d);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(0, 10); central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(d.length, 20);
    central.writeUInt32LE(d.length, 24); central.writeUInt16LE(n.length, 28); central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32); central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38); central.writeUInt32LE(offset, 42);
    directory.push(central, n);

    offset += 30 + n.length + d.length;
  }
  const dirBuf = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dirBuf.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, dirBuf, end]);
};

const file = zip([
  ['[Content_Types].xml', contentTypes],
  ['_rels/.rels', rels],
  ['word/document.xml', documentXml],
  ['word/_rels/document.xml.rels', docRels],
  ['word/styles.xml', stylesXml]
]);

const fileName = `${b.language === 'en' ? 'Cover letter' : 'Personligt brev'} - ${b.employer} - ${b.title}`
  .replace(/[\\/:*?"<>|]/g, '')
  .slice(0, 100) + '.docx';

return [{
  json: item,
  binary: {
    data: {
      data: file.toString('base64'),
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileName,
      fileExtension: 'docx'
    }
  }
}];
