export function Earth() {
  return (
    <mesh>
      <sphereGeometry args={[1, 96, 96]} />
      <meshStandardMaterial color="#0a2d2d" roughness={0.88} metalness={0} />
    </mesh>
  );
}
