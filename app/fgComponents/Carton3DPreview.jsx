// app/fgComponents/Carton3DPreview.jsx
"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Edges } from "@react-three/drei";
import { useMemo } from "react";

function colorFromKey(key) {
  let hash = 0;
  const s = String(key || "Unknown");
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 70% 55%)`;
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function CartonBox({ size, position, color }) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.6} metalness={0.05} />
      <Edges />
    </mesh>
  );
}

export default function Carton3DPreview({ buyer, cartonDimCm, preview }) {
  const metrics = preview?.metrics;
  if (!metrics || !cartonDimCm) return null;

  const w = n(cartonDimCm.w);
  const l = n(cartonDimCm.l);
  const h = n(cartonDimCm.h);

  const across = n(metrics.across);
  const layers = n(metrics.layers);
  const orientation = metrics.orientation;

  const acrossDim = orientation === "LENGTH_ALONG_WIDTH" ? l : w;
  const depthDim = orientation === "LENGTH_ALONG_WIDTH" ? w : l;

  // scale cm -> 3D units
  const s = 0.02; // 1cm = 0.02 unit

  const boxSize = [acrossDim * s, h * s, depthDim * s];

  // show only a few columns in 3D
  const totalColumnsUsed =
    Array.isArray(preview?.columnsBySegment) ? preview.columnsBySegment.reduce((sum, x) => sum + n(x.columnsUsed), 0) : 0;
  const colsToShow = Math.max(1, Math.min(4, totalColumnsUsed || 1));

  const boxes = useMemo(() => {
    const out = [];
    const gap = 0.02;

    for (let col = 0; col < colsToShow; col++) {
      for (let a = 0; a < across; a++) {
        for (let layer = 0; layer < layers; layer++) {
          const x = (a - (across - 1) / 2) * (boxSize[0] + gap);
          const y = (layer - (layers - 1) / 2) * (boxSize[1] + gap);
          const z = (col - (colsToShow - 1) / 2) * (boxSize[2] + gap);

          out.push({
            key: `${col}-${a}-${layer}`,
            position: [x, y, z],
          });
        }
      }
    }
    return out;
  }, [across, layers, colsToShow, boxSize]);

  const color = colorFromKey(buyer);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="font-bold text-slate-800">📦 3D Carton View</div>
        <div className="text-xs text-slate-500">
          Showing {colsToShow} column(s) / total {totalColumnsUsed || 0}
        </div>
      </div>

      <div className="h-[260px] w-full rounded-lg overflow-hidden border border-slate-100">
        <Canvas camera={{ position: [2.2, 2.2, 3.2], fov: 45 }}>
          <ambientLight intensity={0.8} />
          <directionalLight position={[3, 4, 2]} intensity={1.1} />

          {/* Ground */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.2, 0]}>
            <planeGeometry args={[10, 10]} />
            <meshStandardMaterial color="#f1f5f9" />
          </mesh>

          {boxes.map((b) => (
            <CartonBox key={b.key} size={boxSize} position={b.position} color={color} />
          ))}

          <OrbitControls enablePan={false} />
        </Canvas>
      </div>

      <div className="mt-2 text-xs text-slate-600">
        Orientation: <b>{orientation}</b> | Across: <b>{across}</b> | Layers: <b>{layers}</b> | Depth/Column:{" "}
        <b>{n(metrics.columnDepthCm)}cm</b>
      </div>
    </div>
  );
}
