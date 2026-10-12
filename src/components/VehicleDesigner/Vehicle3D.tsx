import { Suspense, useState } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import {
  OrbitControls,
  PerspectiveCamera,
  Environment,
  ContactShadows,
  Grid,
  Edges,
  Text,
  Html,
  Line,
  Billboard,
  Lightformer
} from '@react-three/drei';
import { configureTextBuilder } from 'troika-three-text';
import type { VehicleParams } from './types';

// 本地字体 — 标注均为 ASCII + 数字，latin 子集 woff 足够（~18KB）。
// 未配置时 troika 默认从 jsDelivr CDN 拉取 unicode-font-resolver 元数据 + 字体，
// 离线/弱网下 <Text> 持续 suspend 会拖死整个 3D 场景。
// 必须在任何 <Text> 首次渲染前调用（troika 首次请求后配置即失效）。
configureTextBuilder({ defaultFontURL: '/fonts/Roboto-Regular.woff' });

// 单位转换: mm -> m
const mm2m = (mm: number): number => mm / 1000;

// 标注开关：key -> 是否显示（值恒为 boolean）
type AnnotationSettings = Record<string, boolean>;

// 已保存配置槽位（叠加显示源）
interface SavedSlot {
  id: number;
  name: string;
  params: VehicleParams;
}

// 场景内展示的单个配置（当前配置 id 为字符串 'current'，槽位为数字 id）
interface DisplayConfig {
  id: number | string;
  name: string;
  params: VehicleParams;
}

// 标注项配置
const ANNOTATION_CONFIG = [
  { key: 'length', label: '整车长度', group: 'length' },
  { key: 'frame', label: '底盘长度', group: 'length' },
  { key: 'sensor', label: '智驾长度', group: 'length' },
  { key: 'wheelbase', label: '轴距', group: 'chassis' },
  { key: 'overhangFront', label: '前悬', group: 'chassis' },
  { key: 'overhangRear', label: '后悬', group: 'chassis' },
  { key: 'cargoLength', label: '货厢长度', group: 'cargo' },
  { key: 'cargoVolume', label: '货厢容积', group: 'cargo' },
  { key: 'cargoOverhang', label: '货厢超出', group: 'cargo' },
  { key: 'height', label: '整车高度', group: 'height' },
  { key: 'deck', label: '货台高度', group: 'height' },
  { key: 'width', label: '整车宽度', group: 'width' },
  { key: 'trackWidth', label: '轮距', group: 'width' },
];

// 标注控制面板组件
const AnnotationControlPanel = ({ settings, onChange }: {
  settings: AnnotationSettings;
  onChange: (settings: AnnotationSettings) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const allVisible = Object.values(settings).every(v => v);

  const toggleAll = (value: boolean) => {
    const newSettings: AnnotationSettings = {};
    ANNOTATION_CONFIG.forEach(item => {
      newSettings[item.key] = value;
    });
    onChange(newSettings);
  };

  const toggleItem = (key: string) => {
    onChange({ ...settings, [key]: !settings[key] });
  };

  return (
    <div style={{
      position: 'absolute',
      top: '12px',
      right: '12px',
      zIndex: 100,
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* 主控制按钮 */}
      <div style={{
        display: 'flex',
        gap: '6px',
        marginBottom: expanded ? '8px' : '0',
      }}>
        <button
          onClick={() => toggleAll(!allVisible)}
          style={{
            background: allVisible ? 'rgba(59, 130, 246, 0.9)' : 'rgba(100, 116, 139, 0.9)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            padding: '6px 12px',
            fontSize: '12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          }}
        >
          {allVisible ? '🏷️ 隐藏标注' : '🏷️ 显示标注'}
        </button>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: expanded ? 'rgba(59, 130, 246, 0.9)' : 'rgba(100, 116, 139, 0.9)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            padding: '6px 10px',
            fontSize: '12px',
            cursor: 'pointer',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          }}
        >
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      {/* 展开的多选面板 */}
      {expanded && (
        <div style={{
          background: 'rgba(255, 255, 255, 0.95)',
          borderRadius: '8px',
          padding: '12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          minWidth: '160px',
        }}>
          <div style={{
            fontSize: '11px',
            color: '#64748b',
            marginBottom: '8px',
            fontWeight: '600',
          }}>
            选择显示的标注
          </div>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}>
            {ANNOTATION_CONFIG.map(item => (
              <label
                key={item.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '12px',
                  color: '#334155',
                  cursor: 'pointer',
                  padding: '4px 6px',
                  borderRadius: '4px',
                  background: settings[item.key] ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                }}
              >
                <input
                  type="checkbox"
                  checked={settings[item.key]}
                  onChange={() => toggleItem(item.key)}
                  style={{ cursor: 'pointer' }}
                />
                {item.label}
              </label>
            ))}
          </div>
          <div style={{
            marginTop: '10px',
            paddingTop: '10px',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            gap: '6px',
          }}>
            <button
              onClick={() => toggleAll(true)}
              style={{
                flex: 1,
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                padding: '6px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              全选
            </button>
            <button
              onClick={() => toggleAll(false)}
              style={{
                flex: 1,
                background: '#64748b',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                padding: '6px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              清空
            </button>
          </div>
        </div>
      )}
    </div>
  );
};


// 轮胎组件
const Wheel = ({ position, isGhost }: { position: [number, number, number]; isGhost: boolean }) => (
  <group position={position}>
    <mesh rotation={[Math.PI / 2, 0, 0]} castShadow={!isGhost}>
      <cylinderGeometry args={[0.36, 0.36, 0.22, 32]} />
      <meshPhysicalMaterial
        color={isGhost ? "#94a3b8" : "#1a1a1a"}
        roughness={0.8}
        metalness={0.2}
        transparent={isGhost}
        opacity={isGhost ? 0.2 : 1}
        wireframe={isGhost}
      />
    </mesh>
    {!isGhost && (
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.18, 0.18, 0.23, 16]} />
        <meshPhysicalMaterial color="#666" roughness={0.3} metalness={0.8} />
      </mesh>
    )}
  </group>
);



// 3D 尺寸标注组件
const DimensionLine3D = ({ start, end, label, offset = [0, 0, 0], color = "#64748b" }: {
  start: [number, number, number];
  end: [number, number, number];
  label: string;
  offset?: [number, number, number];
  color?: string;
}) => {
  const s = new THREE.Vector3(...start);
  const e = new THREE.Vector3(...end);
  const off = new THREE.Vector3(...offset);

  const sOff = s.clone().add(off);
  const eOff = e.clone().add(off);
  const center = sOff.clone().lerp(eOff, 0.5);

  return (
    <group>
      {/* 标注横线 */}
      <Line points={[sOff, eOff]} color={color} lineWidth={1} />
      {/* 两端引线 */}
      <Line points={[s, sOff]} color={color} lineWidth={0.5} dashed dashScale={2} opacity={0.5} transparent />
      <Line points={[e, eOff]} color={color} lineWidth={0.5} dashed dashScale={2} opacity={0.5} transparent />
      {/* 标注文字 */}
      <Billboard position={center} follow={true} lockX={false} lockY={false} lockZ={false}>
        <Text
          fontSize={0.25}
          color={color}
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.02}
          outlineColor="#ffffff"
        >
          {label}
        </Text>
      </Billboard>
    </group>
  );
};

// 内部 VehicleModel 组件更新，增加 isGhost 和 annotationSettings
const VehicleModel = ({ params, isGhost, annotationSettings = {} }: {
  params: VehicleParams;
  isGhost: boolean;
  annotationSettings?: AnnotationSettings;
}) => {
  // 根据 annotationSettings 判断各项标注是否显示
  // 如果 settings 中某个 key 为 true，则显示对应标注
  const showLength = annotationSettings.length !== false;
  const showFrame = annotationSettings.frame !== false;
  const showSensor = annotationSettings.sensor !== false;
  const showWheelbase = annotationSettings.wheelbase !== false;
  const showOverhangFront = annotationSettings.overhangFront !== false;
  const showOverhangRear = annotationSettings.overhangRear !== false;
  const showCargoLength = annotationSettings.cargoLength !== false;
  const showCargoVolume = annotationSettings.cargoVolume !== false;
  const showCargoOverhang = annotationSettings.cargoOverhang !== false;
  const showHeight = annotationSettings.height !== false;
  const showDeck = annotationSettings.deck !== false;
  const showWidth = annotationSettings.width !== false;
  const showTrackWidth = annotationSettings.trackWidth !== false;

  const {
    overallLength, overallWidth, overallHeight,
    wheelbase, trackWidth, wheelRadius,
    chassisOverhangFront, chassisOverhangRear,
    platformHeight, cargoLength, cargoWidth, cargoHeight,
    frontModuleLength, sensorTopHeight,
    chassisGroundClearance, chassisWidth, actualOverallLength, cargoGap, chassisLength,
    innerCargoLength, innerCargoWidth, innerCargoHeight, innerCargoVolume
  } = params;

  // 转换为米
  const L = mm2m(overallLength);
  // V3.10: Chassis Length independent
  const CL = mm2m(chassisLength || overallLength);

  const W = mm2m(overallWidth); // Keep for overall logic if needed
  const CW = mm2m(chassisWidth || overallWidth); // Chassis Width
  const H = mm2m(overallHeight); // Converted overallHeight
  const wb = mm2m(wheelbase);
  const tw = mm2m(trackWidth);
  const wr = mm2m(wheelRadius);
  const ohF = mm2m(chassisOverhangFront);
  const pH = mm2m(platformHeight);
  const cL = mm2m(cargoLength);
  const cW = mm2m(cargoWidth);
  const cH = mm2m(cargoHeight);
  const fmL = mm2m(frontModuleLength);
  const fmH = mm2m(sensorTopHeight - platformHeight);
  const gc = mm2m(chassisGroundClearance || 250);
  const gap = mm2m(cargoGap || 0); // V3.9: Gap

  const chassisThickness = pH - gc;
  const chassisY = gc + chassisThickness / 2;
  const cargoY = pH + cH / 2;
  const frontModuleY = pH + fmH / 2;

  const chassisCenterX = (L / 2) - (CL / 2); // Center of Chassis Mesh
  const frontModuleX = L / 2 - fmL / 2;
  // cX = frontModuleRearEdge - gap - halfCargoLength
  const cargoX = (L / 2 - fmL) - gap - (cL / 2);
  const frontWheelX = L / 2 - ohF;
  const rearWheelX = frontWheelX - wb;

  // V3.10: Cargo Overhang specific 3D annotation
  const coh = params.cargoRearOverhang || 0; // Length Overhang
  const cohM = mm2m(coh);
  // Width Overhang: how much cargo extends beyond chassis width
  const widthOH = Math.max(0, cargoWidth - (chassisWidth || cargoWidth));

  // Volume Calculation (using INNER dimensions)
  const vol = innerCargoVolume || ((innerCargoLength || cargoLength) * (innerCargoWidth || cargoWidth) * (innerCargoHeight || cargoHeight) / 1e9);

  const ghostProps = isGhost ? {
    opacity: 0.3,
    transparent: true,
    wireframe: false,
    color: "#f97316"  // 橙色使对比更明显
  } : {};

  // 尺寸标注点计算
  const groundZ = W / 2 + 1; // 侧面标注的 Z 偏移平面

  return (
    <group>
      {/* 底盘 */}
      <mesh position={[chassisCenterX, chassisY, 0]} castShadow={!isGhost} receiveShadow={!isGhost}>
        <boxGeometry args={[CL, Math.max(chassisThickness, 0.05), CW]} />
        {isGhost ? (
          <meshBasicMaterial {...ghostProps} />
        ) : (
          <meshPhysicalMaterial color="#475569" roughness={0.4} metalness={0.1} />
        )}
        <Edges color={isGhost ? "#f97316" : "#1e293b"} threshold={15} lineWidth={isGhost ? 2 : 1} />
      </mesh>

      {/* 货厢 */}
      <mesh position={[cargoX, cargoY, 0]} castShadow={!isGhost} receiveShadow={!isGhost}>
        <boxGeometry args={[cL, cH, cW]} />
        {isGhost ? (
          <meshBasicMaterial {...ghostProps} />
        ) : (
          <meshPhysicalMaterial color="#bae6fd" transparent opacity={0.7} roughness={0.4} metalness={0.1} />
        )}
        <Edges color={isGhost ? "#f97316" : "#0284c7"} threshold={15} lineWidth={isGhost ? 2 : 1} />
      </mesh>

      {/* 智驾模组 */}
      <mesh position={[frontModuleX, frontModuleY, 0]} castShadow={!isGhost} receiveShadow={!isGhost}>
        <boxGeometry args={[fmL, fmH, CW]} />
        {isGhost ? (
          <meshBasicMaterial {...ghostProps} />
        ) : (
          <meshPhysicalMaterial color="#fed7aa" roughness={0.4} metalness={0.1} />
        )}
        <Edges color={isGhost ? "#f97316" : "#ea580c"} threshold={15} lineWidth={isGhost ? 2 : 1} />
      </mesh>

      {/* 轮胎 */}
      <group>
        <Wheel position={[frontWheelX, wr, tw / 2]} isGhost={isGhost} />
        <Wheel position={[frontWheelX, wr, -tw / 2]} isGhost={isGhost} />
        <Wheel position={[rearWheelX, wr, tw / 2]} isGhost={isGhost} />
        <Wheel position={[rearWheelX, wr, -tw / 2]} isGhost={isGhost} />
      </group>

      {!isGhost && (
        <line>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array([rearWheelX, 0.02, 0, frontWheelX, 0.02, 0]), 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#ef4444" linewidth={2} />
        </line>
      )}

      {/* 尺寸标注 (仅在非 Ghost 模式下显示) */}
      {!isGhost && (
        <group>
          {/* 1. 整车长度 (使用实际长度) - 最外层 */}
          {showLength && (
            <DimensionLine3D
              start={[L/2, 0, groundZ]}
              end={[-L/2, 0, groundZ]}
              label={`L ${Math.round(actualOverallLength || overallLength)}`}
              offset={[0, 0, 1.2]}
            />
          )}
          {/* 1.1 底盘/车架长度 - 中间层 */}
          {showFrame && (
            <DimensionLine3D
              start={[L/2, 0, groundZ]}
              end={[L/2 - CL, 0, groundZ]}
              label={`Frame ${chassisLength || overallLength}`}
              offset={[0, 0, 0.9]}
              color="#475569"
            />
          )}
          {/* 1.2 智驾模组长度 */}
          {showSensor && (
            <DimensionLine3D
              start={[frontModuleX + fmL/2, fmH + pH + 0.2, CW/2 + 0.1]}
              end={[frontModuleX - fmL/2, fmH + pH + 0.2, CW/2 + 0.1]}
              label={`Sensor ${frontModuleLength}`}
              offset={[0, 0, 0]}
              color="#ea580c"
            />
          )}

          {/* 2. 轴距 */}
          {showWheelbase && (
            <DimensionLine3D
              start={[frontWheelX, 0, groundZ]}
              end={[rearWheelX, 0, groundZ]}
              label={`WB ${wheelbase}`}
              offset={[0, 0, 0.6]}
            />
          )}
          {/* 3. 前悬 */}
          {showOverhangFront && (
            <DimensionLine3D
              start={[L/2, 0, groundZ]}
              end={[frontWheelX, 0, groundZ]}
              label={`OH(F) ${chassisOverhangFront}`}
              offset={[0, 0, 0.3]}
            />
          )}
          {/* 4. 后悬 */}
          {showOverhangRear && (
            <DimensionLine3D
              start={[rearWheelX, 0, groundZ]}
              end={[L/2 - CL, 0, groundZ]}
              label={`OH(R) ${chassisOverhangRear}`}
              offset={[0, 0, 0.3]}
            />
          )}
          {/* 5. 货厢尺寸 */}
          {showCargoLength && (
            <DimensionLine3D
              start={[cargoX + cL/2, cargoY + cH/2 + 0.2, 0]}
              end={[cargoX - cL/2, cargoY + cH/2 + 0.2, 0]}
              label={`Box L ${cargoLength}`}
              offset={[0, 0.2, 0]}
              color="#0ea5e9"
            />
          )}
          {/* 5.1 货厢容积公式 */}
          {showCargoVolume && (
            <Billboard position={[cargoX, cargoY, 0]}>
               <Text fontSize={0.16} color="#0ea5e9" outlineWidth={0.02} outlineColor="#ffffff">
                 {`Vol: ${Math.round(innerCargoLength || cargoLength)}*${Math.round(innerCargoWidth || cargoWidth)}*${Math.round(innerCargoHeight || cargoHeight)}=${typeof vol === 'number' ? vol.toFixed(1) : vol}m3`}
               </Text>
            </Billboard>
          )}

          {/* 5.2 货箱超出标注 - 显示超出底盘的长宽 */}
          {showCargoOverhang && (coh > 10 || widthOH > 0) && (
             <>
               {coh > 10 && (
                 <DimensionLine3D
                    start={[L/2 - CL, 0, groundZ]}
                    end={[L/2 - CL - cohM, 0, groundZ]}
                    label={`OH ${Math.round(coh)}`}
                    offset={[0, 0, 1.0]}
                    color="#dc2626"
                 />
               )}
               <Billboard position={[cargoX, cargoY - 0.3, 0]}>
                   <Text fontSize={0.12} color="#dc2626" outlineWidth={0.02} outlineColor="#ffffff" anchorY="top">
                     {`OH: L+${Math.round(coh)} W+${Math.round(widthOH)}`}
                   </Text>
               </Billboard>
             </>
          )}

          {/* 6. 整车高度 */}
          {showHeight && (
            <DimensionLine3D
              start={[-L/2, 0, -groundZ]}
              end={[-L/2, H, -groundZ]}
              label={`H ${overallHeight}`}
              offset={[-0.5, 0, 0]}
            />
          )}
          {/* 7. 货台高度 */}
          {showDeck && (
             <DimensionLine3D
              start={[L/2, 0, -groundZ]}
              end={[L/2, pH, -groundZ]}
              label={`Deck ${platformHeight}`}
              offset={[0.5, 0, 0]}
            />
          )}
          {/* 8. 整车宽度 (前部) */}
          {showWidth && (
            <DimensionLine3D
              start={[frontModuleX + fmL/2, fmH + pH + 0.5, W/2]}
              end={[frontModuleX + fmL/2, fmH + pH + 0.5, -W/2]}
              label={`W ${overallWidth}`}
              offset={[0, 0.2, 0]}
            />
          )}
          {/* 9. 轮距 (前轮) */}
          {showTrackWidth && (
            <DimensionLine3D
              start={[frontWheelX, wr + 0.5, tw/2]}
              end={[frontWheelX, wr + 0.5, -tw/2]}
              label={`Track ${trackWidth}`}
              offset={[0, 0, 0]}
              color="#94a3b8"
            />
          )}
        </group>
      )}
    </group>
  );
};

// 场景内容组件
const VehicleScene = ({ configs, annotationSettings }: {
  configs: DisplayConfig[];
  annotationSettings: AnnotationSettings;
}) => {
  // 计算布局参数
  const spacing = 4; // 模型间距（米）
  const totalWidth = (configs.length - 1) * spacing;
  const startZ = -totalWidth / 2;

  // 计算相机位置（基于最长车辆）
  const maxL = Math.max(...configs.map(c => mm2m(c.params.overallLength)));
  // 根据模型数量和车长适当拉远相机
  const cameraDistance = Math.max(maxL * 1.8, 6) + (configs.length > 1 ? configs.length * 2 : 0);

  return (
    <>
      <PerspectiveCamera
        makeDefault
        position={[cameraDistance, cameraDistance * 0.8, cameraDistance]}
        fov={45}
        near={0.1}
        far={100}
      />
      <OrbitControls
        makeDefault
        minDistance={2}
        maxDistance={40}
        enablePan={true}
        target={[0, 1, 0]}
      />

      {/* 光照系统 */}
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[10, 15, 10]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <directionalLight position={[-5, 5, -5]} intensity={0.5} />

      {/* 本地程序化环境光 — 替代 preset="city" 网络 HDRI，修复 WebGL 上下文丢失 + 离线可用 */}
      <Environment resolution={256}>
        <group rotation={[-Math.PI / 3, 0, 1]}>
          <Lightformer form="circle" intensity={4} position={[0, 5, -9]} scale={2} />
          <Lightformer form="rect" intensity={2} position={[5, 1, -1]} scale={[3, 2, 1]} />
          <Lightformer form="rect" intensity={1.5} position={[-5, 2, 2]} scale={[3, 2, 1]} />
          <Lightformer form="rect" intensity={1} position={[0, 8, 4]} scale={[4, 2, 1]} />
        </group>
      </Environment>

      <Grid
        position={[0, 0, 0]}
        args={[40, 40]}
        cellSize={0.5}
        cellThickness={0.5}
        cellColor="#94a3b8"
        sectionSize={2}
        sectionThickness={1}
        sectionColor="#64748b"
        fadeDistance={50}
        fadeStrength={1}
        followCamera={false}
      />

      <ContactShadows
        position={[0, 0, 0]}
        opacity={0.4}
        scale={30}
        blur={2}
        far={5}
      />

      <Suspense fallback={null}>
        {configs.map((config, index) => {
          const zOffset = startZ + index * spacing;
          return (
            <group key={config.id || index} position={[0, 0, zOffset]}>
              {/* 模型标题标签 */}
              <Html position={[0, mm2m(config.params.overallHeight) + 1.5, 0]} center>
                <div style={{
                  background: index === 0 ? 'rgba(37, 99, 235, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                  color: index === 0 ? 'white' : '#1e293b',
                  padding: '4px 12px',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                  fontFamily: 'system-ui',
                  border: index === 0 ? 'none' : '1px solid #e2e8f0',
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none'
                }}>
                  {index === 0 ? "Current Config" : `#${index} ${config.name}`}
                </div>
              </Html>

              <VehicleModel
                params={config.params}
                isGhost={false}
                annotationSettings={annotationSettings}
              />
            </group>
          );
        })}
      </Suspense>
    </>
  );
};

// 主组件：单场景多模型
const Vehicle3D = ({ params, selectedSlots = [] }: {
  params: VehicleParams;
  selectedSlots?: SavedSlot[];
}) => {
  // 构建显示列表: [当前配置, ...选中配置]
  const displayConfigs: DisplayConfig[] = [
    { id: 'current', name: '当前配置', params },
    ...selectedSlots
  ];

  // 标注设置状态 - 默认全部显示
  const [annotationSettings, setAnnotationSettings] = useState<AnnotationSettings>(() => {
    const initial: AnnotationSettings = {};
    ANNOTATION_CONFIG.forEach(item => {
      initial[item.key] = true;
    });
    return initial;
  });

  return (
    <div className="w-full h-full relative bg-slate-200">
      {/* 全局标注控制面板 */}
      <AnnotationControlPanel
        settings={annotationSettings}
        onChange={setAnnotationSettings}
      />

      <Canvas shadows dpr={[1, 2]}>
        <VehicleScene
          configs={displayConfigs}
          annotationSettings={annotationSettings}
        />
      </Canvas>

      {/* 操作提示 */}
      <div style={{
        position: 'absolute',
        bottom: '12px',
        left: '12px',
        background: 'rgba(0,0,0,0.6)',
        color: 'white',
        padding: '6px 12px',
        borderRadius: '6px',
        fontSize: '11px',
        fontFamily: 'monospace',
        pointerEvents: 'none'
      }}>
        🖱️ 左键旋转 | 右键平移 | 滚轮缩放 | 全局同步控制
      </div>
    </div>
  );
};

export default Vehicle3D;