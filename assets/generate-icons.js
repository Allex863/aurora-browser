const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function generateIcons() {
  const svgPath = path.join(__dirname, 'icon.svg');
  const assetsDir = __dirname;
  
  // Генерация PNG иконок разных размеров
  const sizes = [16, 32, 48, 64, 128, 256, 512];
  
  for (const size of sizes) {
    await sharp(svgPath)
      .resize(size, size)
      .png()
      .toFile(path.join(assetsDir, `icon-${size}x${size}.png`));
    console.log(`Создана иконка ${size}x${size}`);
  }
  
  // Создание основной иконки 512x512
  await sharp(svgPath)
    .resize(512, 512)
    .png()
    .toFile(path.join(assetsDir, 'icon-512.png'));
  
  console.log('Иконки успешно созданы!');
}

generateIcons().catch(console.error);
