// Writes tests/fixtures/sample-resume.pdf (fictional SAMPLE persona) from the text fixture.
import { readFileSync, writeFileSync } from "node:fs";
import { PDFDocument, StandardFonts } from "pdf-lib";

const text = readFileSync("tests/fixtures/sample-resume.txt", "utf8");
const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const page = doc.addPage([612, 792]);
let y = 740;
for (const raw of text.split("\n")) {
  const words = raw.split(" ");
  let line = "";
  for (const w of words) {
    if (font.widthOfTextAtSize(`${line} ${w}`, 11) > 500) {
      page.drawText(line, { x: 56, y, size: 11, font });
      y -= 16;
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  page.drawText(line, { x: 56, y, size: 11, font });
  y -= 16;
}
writeFileSync("tests/fixtures/sample-resume.pdf", await doc.save());
console.log("wrote tests/fixtures/sample-resume.pdf");
