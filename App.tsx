import 'react-native-gesture-handler';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';

import HomeScreen from './screens/HomeScreen';
import FuncionariosScreen from './screens/FuncionariosScreen';

const Drawer = createDrawerNavigator();

export default function App() {
    return (
        <NavigationContainer>
            <Drawer.Navigator initialRouteName="Home">
                <Drawer.Screen
                    name="Home"
                    component={HomeScreen}
                    options={{ title: "Início" }}
                />
                <Drawer.Screen
                    name="Funcionarios"
                    component={FuncionariosScreen}
                    options={{ title: "Funcionários" }}
                />
            </Drawer.Navigator>
        </NavigationContainer>
    );
}