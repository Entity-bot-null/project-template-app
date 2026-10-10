// Static images imported by path: Metro turns them into an asset reference
// (a number) that Image and expo-image accept as a source.
declare module '*.png' {
  const asset: number;
  export default asset;
}
