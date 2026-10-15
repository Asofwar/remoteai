import { registerRootComponent } from 'expo';
import { useEffect, useState } from 'react';
import { PermissionsAndroid, Text } from 'react-native';
import { MappingPreview } from '../src/chat/portMapping/MappingPreview';

function App() {
  const [authorized, setAuthorized] = useState(false);
  useEffect(() => {
    void PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA).then(granted => {
      if (!granted) throw new Error('Grant CAMERA before starting this fixture');
      console.log('PREVIEW_CAMERA_PREGRANTED'); setAuthorized(true);
    });
  }, []);
  return authorized ? <MappingPreview port={1497} close={() => {}} /> : <Text>Checking camera permission</Text>;
}
registerRootComponent(App);
