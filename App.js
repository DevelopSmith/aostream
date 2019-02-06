import React, {Component} from 'react';
import {StyleSheet, Text, View, TextInput, TouchableOpacity} from 'react-native';
import { createStackNavigator, createAppContainer } from "react-navigation";

import Broadcast from './Broadcast';

type Props = {};
class App extends Component<Props> {
	state = {
		startBroadcast: '',
		listenBroadcast: '',
	}

	setFieldValue = (value, field) => this.setState({ [field]: value });

	listenBroadcast = () => {
		const { listenBroadcast } = this.state;

		if(listenBroadcast){
			this.props.navigation.navigate('Broadcast', { roomID: listenBroadcast });
		}else{
			alert('Please enter a code!');
		}
	}

	startBroadcast = () => {
		const { startBroadcast } = this.state;

		if(startBroadcast){
			this.props.navigation.navigate('Broadcast', { roomID: startBroadcast });
		}else{
			alert('Please enter a code!');
		}
	}

	render() {
		return (
			<View style={styles.container}>
				<View style={styles.boxWrap}>
					<Text style={styles.title}>Start Broadcast</Text>
					<TextInput style={styles.inputField} onChangeText={ text => this.setFieldValue(text, 'startBroadcast') } value={this.state.startBroadcast} placeholder="Unique Code" />

					<TouchableOpacity style={[styles.button, {backgroundColor: '#00ff67'}]} onPress={this.startBroadcast}>
						<Text style={styles.buttonText}>Start Broadcast</Text>
					</TouchableOpacity>
				</View>

				<View style={styles.boxWrap}>
					<Text style={styles.title}>Listen To Broadcast</Text>
					<TextInput style={styles.inputField} onChangeText={ text => this.setFieldValue(text, 'listenBroadcast') } value={this.state.listenBroadcast} placeholder="Unique Code" />

					<TouchableOpacity style={[styles.button, {backgroundColor: '#ffdd00'}]} onPress={this.listenBroadcast}>
						<Text style={styles.buttonText}>Start Listening</Text>
					</TouchableOpacity>
				</View>
			</View>
		);
	}
}

const grayish = '#707070';

const styles = StyleSheet.create({
	container: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		backgroundColor: '#F5FCFF',
	},
	boxWrap: {
		backgroundColor: '#f7f7f7',
		borderWidth: 1,
		borderColor: '#e8e8e8',
		borderRadius: 2,
		width: '90%',
		margin: '5%',
		padding: 10
	},
	title: {
		color: grayish,
		fontSize: 20,
		textAlign: 'left',
	},
	inputField: {
		color: grayish,
		borderColor: grayish,
		borderWidth: 1,
		marginTop: 20,
		marginBottom: 20,
		paddingLeft: 10,
	},
	button: {
		color: grayish,
		width: '100%',
		padding: 8
	},
	buttonText: {
		textAlign: 'center',
		fontSize: 18,
		width: '100%',
		lineHeight: 30,
	}
});

const AppNavigator = createStackNavigator({
	App: {
		screen: App
	},
	Broadcast: {
		screen: Broadcast
	}
});
  
export default createAppContainer(AppNavigator);