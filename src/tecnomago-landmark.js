import { Box3, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const loader = new GLTFLoader();

function placeTecnomago(context) {
  const { scene } = context;
  if (scene.getObjectByName("TecnomagoCharacter")) return;
  const house = scene.getObjectByName("TecnomagoHouse");
  if (!house) return;

  const housePosition = house.position;
  const houseYaw = house.rotation.y;
  const forwardX = Math.sin(houseYaw);
  const forwardZ = Math.cos(houseYaw);
  const sideX = Math.cos(houseYaw);
  const sideZ = -Math.sin(houseYaw);
  const desired = new Vector3(housePosition.x + forwardX * 5.8 + sideX * 2.2, housePosition.y, housePosition.z + forwardZ * 5.8 + sideZ * 2.2);

  loader.load("/artwork/models/tecnomago.glb", (gltf) => {
    const model = gltf.scene;
    model.name = "TecnomagoCharacter";
    model.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        if (!material) return;
        if ("metalness" in material) material.metalness = 0;
        if ("roughness" in material) material.roughness = 0.82;
      });
    });

    const rawBounds = new Box3().setFromObject(model);
    const rawHeight = Math.max(rawBounds.max.y - rawBounds.min.y, 0.001);
    const scale = 2.7 / rawHeight;
    model.scale.setScalar(scale);
    model.updateMatrixWorld(true);
    const scaledBounds = new Box3().setFromObject(model);
    model.position.copy(desired);
    model.position.y -= scaledBounds.min.y;
    model.rotation.y = houseYaw + Math.PI;
    scene.add(model);
    console.info("[Tamarind 3D] Tecnomago GLB carregado junto à entrada da casa.");
  }, undefined, (error) => console.error("[Tamarind 3D] Falha ao carregar tecnomago.glb", error));
}

function install(context) {
  if (context) placeTecnomago(context);
}
window.addEventListener("tamarind-tecnomago-ready", (event) => install(event.detail));
install(window.__tamarindTecnomagoContext);
