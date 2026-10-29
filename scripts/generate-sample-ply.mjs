import fs from 'fs';
import path from 'path';

// Generate a realistic 3D point cloud of a concrete wall surface with a structural crack fissure
const width = 160;
const height = 120;
const totalVertices = width * height;

const outPath = path.resolve('public/samples/concrete_wall_surface.ply');

let header = `ply
format ascii 1.0
comment Surface 3D Concrete Wall Inspection Sample
element vertex ${totalVertices}
property float x
property float y
property float z
property uchar red
property uchar green
property uchar blue
end_header
`;

const lines = [header];

for (let j = 0; j < height; j++) {
  const y = (j - height / 2) * 6.0; // in mm: -360 to +360 mm
  for (let i = 0; i < width; i++) {
    const x = (i - width / 2) * 6.0; // in mm: -480 to +480 mm

    // Base surface with slight natural roughness (-0.8 to +0.8 mm)
    const roughness = (Math.sin(i * 0.4) * Math.cos(j * 0.3) + (Math.random() - 0.5) * 0.6);
    let z = roughness;

    // Base concrete color (warm stone / grey-beige: r: 175-195, g: 170-190, b: 160-180)
    let r = Math.min(255, Math.max(0, Math.floor(185 + (Math.random() - 0.5) * 20)));
    let g = Math.min(255, Math.max(0, Math.floor(180 + (Math.random() - 0.5) * 20)));
    let b = Math.min(255, Math.max(0, Math.floor(170 + (Math.random() - 0.5) * 20)));

    // Crack trajectory: a vertical fissure centered around x ~ 40mm, weaving downwards
    const crackCenter = 35 + Math.sin(j * 0.08) * 28 + Math.cos(j * 0.2) * 12;
    const distToCrack = Math.abs(x - crackCenter);

    if (distToCrack < 8.0 && j > 15 && j < 105) {
      // Crack fissure indentation: depth displacement up to 4.2 mm
      const depthFactor = (1 - distToCrack / 8.0);
      z -= depthFactor * 4.2;

      // Darker shading inside the fissure / shadow
      const shade = 1 - depthFactor * 0.55;
      r = Math.floor(r * shade);
      g = Math.floor(g * shade);
      b = Math.floor(b * shade);

      // Add a slight terracotta/rust discoloration near crack edges
      if (distToCrack > 3.0) {
        r = Math.min(255, r + 15);
        b = Math.max(0, b - 15);
      }
    }

    lines.push(`${x.toFixed(2)} ${y.toFixed(2)} ${z.toFixed(2)} ${r} ${g} ${b}\n`);
  }
}

fs.writeFileSync(outPath, lines.join(''));
console.log(`Generated PLY file at ${outPath} with ${totalVertices} vertices.`);
