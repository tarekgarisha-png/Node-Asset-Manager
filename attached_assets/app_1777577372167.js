import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import ScannerScreen from './screens/ScannerScreen';
import ProductsScreen from './screens/ProductsScreen';
import { initDB } from './utils/database';

const Tab = createBottomTabNavigator();

export default function App() {
  React.useEffect(() => {
    initDB();
  }, []);

  return (
    <NavigationContainer>
      <Tab.Navigator>
        <Tab.Screen name="Scanner" component={ScannerScreen} />
        <Tab.Screen name="Products" component={ProductsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}