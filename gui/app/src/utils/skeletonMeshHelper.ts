import {
  Box3,
  CanvasTexture,
  Color,
  Euler,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry';
import { SkeletonRenderPart } from './skeletonHelper';
import { BodyPart, BoneT } from 'solarxr-protocol';
import { QuaternionFromQuatT } from '@/maths/quaternion';
import { Vector3FromVec3fT } from '@/maths/vector3';
import {
  BoneShapeConfig,
  DefaultBoneModelUrl,
  ModelDimensions,
  SKELETON_PART_PRESETS,
  computeShapeScale,
} from './skeletonParts';
import { SkeletonProportions, deriveSkeletonProportions } from './skeletonProportions';

// BOBvr: light wood, like an artist's wooden mannequin
const MOD_WOOD = new Color('#e8c9a0');

// BOBvr: two dots and a wide smile, drawn once
let modFaceTexture: CanvasTexture | null = null;
function getModFaceTexture(): CanvasTexture {
  if (modFaceTexture) return modFaceTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#1a1a1a';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineCap = 'round';
    ctx.lineWidth = 10;
    for (const x of [92, 164]) {
      ctx.beginPath();
      ctx.arc(x, 62, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(128, 56, 80, Math.PI * 0.18, Math.PI * 0.82);
    ctx.stroke();
  }
  modFaceTexture = new CanvasTexture(canvas);
  return modFaceTexture;
}

// The head model faces -Z in its own space (its node is turned 180 deg in the
// scene). It can be a group of meshes, each gets its part of the face.
function addModFace(head: Object3D) {
  head.updateMatrixWorld(true);
  const meshes: Mesh[] = [];
  head.traverse((child) => {
    if (child instanceof Mesh) meshes.push(child);
  });
  for (const mesh of meshes) {
    const geometry = new DecalGeometry(
      mesh,
      new Vector3(0, 0.02, -0.13),
      new Euler(0, Math.PI, 0),
      new Vector3(0.12, 0.09, 0.2)
    );
    const decal = new Mesh(
      geometry,
      new MeshStandardMaterial({
        map: getModFaceTexture(),
        transparent: true,
        roughness: 0.6,
        polygonOffset: true,
        polygonOffsetFactor: -4,
      })
    );
    // DecalGeometry is in world space, the decal hangs under the mesh
    decal.matrixAutoUpdate = false;
    decal.matrix.copy(mesh.matrixWorld).invert();
    mesh.add(decal);
  }
}

const position = new Vector3();
const quat = new Quaternion();

const modelBox = new Box3();

// Shared loader + cache: each model URL is fetched and parsed once, then cloned
// per instance. Same pattern as the tracker preview (IMUVisualizerWidget).
const gltfLoader = new GLTFLoader();
const modelCache = new Map<string, Promise<Object3D | null>>();
function loadModel(url: string): Promise<Object3D | null> {
  let p = modelCache.get(url);
  if (!p) {
    p = gltfLoader
      .loadAsync(url)
      .then((gltf) => gltf.scene)
      .catch((err) => {
        console.error('MODEL LOAD FAIL', url, err);
        return null;
      }); // nothing to draw for this bone yet
    modelCache.set(url, p);
  }
  return p;
}

interface AttachedShape {
  config: BoneShapeConfig;
  /** On the bone: its orientation, and the shape's offset and size along its axes. */
  node: Object3D;
  /** Under the node: the turn that puts the model onto the bone's axes. */
  tilt: Object3D;
  /** From the bone's head to the node, in the bone's axes. */
  offset: Vector3;
  model: ModelDimensions | null;
  /** The model's box in its own axes. */
  bounds: Box3 | null;
}

interface BonePart extends SkeletonRenderPart {
  shapes: AttachedShape[];
}

/**
 * Renders a skeleton with modular 3D models or primitives attached to each bone.
 * Every bone holds a list of rigid shapes (e.g. spine column, chestplate armor, etc.)
 * that transform and scale dynamically with bone kinematics and user proportions.
 */
export class BasedSkeletonMeshHelper extends Object3D {
  readonly type = 'SkeletonMeshHelper';
  private parts: BonePart[] = [];
  private proportions: SkeletonProportions = deriveSkeletonProportions(new Map());
  private disposed = false;

  constructor(bones: Map<BodyPart, BoneT>) {
    super();

    const addrObject = (modelUrl: string, partName: string) =>
      modelUrl + ':' + partName;
    const modelUrlsToFetch = new Set<string>();
    const partsByAddr: Record<string, Array<[BonePart, AttachedShape]>> = {};

    for (const bone of bones.values()) {
      if (bone.bodyPart === BodyPart.NONE) continue;
      const config = SKELETON_PART_PRESETS[bone.bodyPart];
      if (config === undefined || !config.visible) continue;

      const part: BonePart = {
        bone,
        shapes: [],
      };
      for (const shapeConfig of config.shapes) {
        const node = new Object3D();
        node.matrixAutoUpdate = false;
        this.add(node);

        const tilt = new Object3D();
        node.add(tilt);

        const attached: AttachedShape = {
          config: shapeConfig,
          node,
          tilt,
          offset: new Vector3(),
          model: null,
          bounds: null,
        };

        const modelUrl = shapeConfig.modelUrl ?? DefaultBoneModelUrl;
        const partName = shapeConfig.objectName;
        if (partName && modelUrl) {
          modelUrlsToFetch.add(modelUrl);
          const addr = addrObject(modelUrl, partName);
          (partsByAddr[addr] ??= []).push([part, attached]);
        }

        part.shapes.push(attached);
      }

      this.parts.push(part);
    }

    modelUrlsToFetch.forEach((url) =>
      loadModel(url).then((scene) => {
        if (!scene || this.disposed) return;

        scene.traverse((og) => {
          if (og === scene) return;

          const addr = addrObject(url, og.name);

          if (og instanceof Mesh) {
            const mat = og.material as MeshStandardMaterial;
            if (mat.emissiveMap == null) {
              mat.emissiveMap = mat.map;
              mat.emissiveIntensity = 0.2;
              mat.emissive = new Color(1, 1, 1);
              mat.color = new Color(0.89, 0.89, 0.94);
            }
          }

          for (const [part, attached] of partsByAddr[addr] ?? []) {
            const o = og.clone(true);
            // BOBvr: wooden mannequin (plain wood, no purple joints)
            o.traverse((child) => {
              if (!(child instanceof Mesh)) return;
              const mat = (child.material as MeshStandardMaterial).clone();
              mat.map = null;
              mat.emissiveMap = null;
              mat.emissive = new Color(0, 0, 0);
              mat.color = MOD_WOOD;
              mat.roughness = 0.6;
              child.material = mat;
            });

            o.position.set(0, 0, 0);
            o.quaternion.identity();
            o.scale.set(1, 1, 1);

            modelBox.setFromObject(o);

            attached.model = {
              width: modelBox.max.x - modelBox.min.x,
              depth: modelBox.max.z - modelBox.min.z,
              length: Math.abs(modelBox.min.y),
            };

            attached.bounds = modelBox.clone();
            attached.tilt.clear();
            // BOBvr: smiley face on the front of the head
            if (part.bone.bodyPart === BodyPart.HEAD) addModFace(o);
            attached.tilt.add(o);
          }
        });
      })
    );
  }

  setProportions(proportions: SkeletonProportions) {
    this.proportions = proportions;
  }

  setBones(bones: Map<BodyPart, BoneT>) {
    for (const part of this.parts) {
      const bone = bones.get(part.bone.bodyPart);
      if (!bone) continue;
      part.bone = bone;
    }
  }

  updateMatrixWorld(force: boolean) {
    for (const part of this.parts) {
      const { bone, shapes } = part;

      position.copy(Vector3FromVec3fT(bone.headPosition));
      quat.copy(QuaternionFromQuatT(bone.orientation)).normalize();
      const boneLength = Math.max(bone.boneLength, 1e-4);

      for (const attached of shapes) {
        const { config, node, tilt, model } = attached;
        const size = computeShapeScale(
          config,
          this.proportions,
          boneLength,
          model ?? undefined
        );

        attached.offset.set(0, 0, 0);
        if (config.offset && model) {
          attached.offset.copy(
            config.offset({ model, proportions: this.proportions, boneLength })
          );
        }

        node.position.copy(attached.offset).applyQuaternion(quat).add(position);
        node.quaternion.copy(quat);
        node.scale.set(size.width, size.length, size.depth);
        node.updateMatrix();

        if (config.rotation) tilt.quaternion.copy(config.rotation);
      }
    }

    super.updateMatrixWorld(force);
  }

  dispose() {
    this.disposed = true;
    for (const part of this.parts) {
      for (const attached of part.shapes) {
        this.remove(attached.node);
      }
    }
    this.parts = [];
  }
}
