import React, { Component } from 'react';
import { StyleSheet, Text, TouchableHighlight, View, Platform } from 'react-native';

import io from 'socket.io-client';
import { RTCPeerConnection, RTCMediaStream, RTCIceCandidate, RTCSessionDescription, RTCView, MediaStreamTrack, mediaDevices, getUserMedia } from 'react-native-webrtc';

let socket;
const configuration = { "iceServers": [{ "url": "stun:stun.l.google.com:19302" }] };

const pcPeers = {};
let localStream;
let isBroadcaster = true;
let thePC = null;

function getLocalStream(isFront, callback) {
    let videoSourceId;

    // on android, you don't have to specify sourceId manually, just use facingMode
    // uncomment it if you want to specify
    /* if(Platform.OS === 'ios') {
        MediaStreamTrack.getSources(sourceInfos => {
            console.log("sourceInfos: ", sourceInfos);

            for (const i = 0; i < sourceInfos.length; i++) {
                const sourceInfo = sourceInfos[i];
                if (sourceInfo.kind == "video" && sourceInfo.facing == (isFront ? "front" : "back")) {
                    videoSourceId = sourceInfo.id;
                }
            }
        });
    } */

    getUserMedia({
        audio: true,
        video: false
    }).then(stream => {
        console.log('getUserMedia success', stream);

        callback(stream);
    }).then(logError);
}

function join(roomID) {
    socket.emit('join', roomID, function (socketIds) {
        console.log('join', socketIds);

        for (const i in socketIds) {
            const socketId = socketIds[i];
            createPC(socketId, true);
        }
    });
}

function createPC(socketId, isOffer) {
    const pc = new RTCPeerConnection(configuration);
    pcPeers[socketId] = pc;

    pc.onicecandidate = function (event) {
        console.log('onicecandidate', event.candidate);
        if (event.candidate) {
            socket.emit('exchange', { 'to': socketId, 'candidate': event.candidate });
        }
    };

    function createOffer() {
        pc.createOffer(function (desc) {
            console.log('createOffer', desc);
            pc.setLocalDescription(desc, function () {
                console.log('setLocalDescription', pc.localDescription);
                socket.emit('exchange', { 'to': socketId, 'sdp': pc.localDescription });
            }, logError);
        }, logError);
    }

    pc.onnegotiationneeded = function () {
        console.log('onnegotiationneeded');
        if (isOffer) {
            createOffer();
        }
    }

    pc.oniceconnectionstatechange = function (event) {
        console.log('oniceconnectionstatechange', event.target.iceConnectionState);
        if (event.target.iceConnectionState === 'completed') {
            /* setTimeout(() => {
                getStats();
            }, 1000); */
        }
        if (event.target.iceConnectionState === 'connected') {
            createDataChannel();
        }
    };
    pc.onsignalingstatechange = function (event) {
        console.log('onsignalingstatechange', event.target.signalingState);
    };

    pc.onaddstream = function (event) {
        console.log('onaddstream', event.stream);
        container.setState({ info: 'One peer join!' });

        const remoteList = container.state.remoteList;
        remoteList[socketId] = event.stream.toURL();
        container.setState({ remoteList: remoteList });
    };
    pc.onremovestream = function (event) {
        console.log('onremovestream', event.stream);
    };

    if(!isBroadcaster){
        localStream.getAudioTracks()[0].enabled = false;
    }

    pc.addStream(localStream);

    function createDataChannel() {
        if (pc.textDataChannel) {
            return;
        }
        const dataChannel = pc.createDataChannel("text");

        dataChannel.onerror = function (error) {
            console.log("dataChannel.onerror", error);
        };

        dataChannel.onmessage = function (event) {
            console.log("dataChannel.onmessage:", event.data);
            container.receiveTextData({ user: socketId, message: event.data });
        };

        dataChannel.onopen = function () {
            console.log('dataChannel.onopen');
            container.setState({ textRoomConnected: true });
        };

        dataChannel.onclose = function () {
            console.log("dataChannel.onclose");
        };

        pc.textDataChannel = dataChannel;
    }

    console.log(pc);
    console.log(localStream);
    thePC = pc;

    return pc;
}

function exchange(data) {
    const fromId = data.from;
    let pc;
    if (fromId in pcPeers) {
        pc = pcPeers[fromId];
    } else {
        pc = createPC(fromId, false);
    }

    if (data.sdp) {
        console.log('exchange sdp', data);
        pc.setRemoteDescription(new RTCSessionDescription(data.sdp), function () {
            if (pc.remoteDescription.type == "offer")
                pc.createAnswer(function (desc) {
                    console.log('createAnswer', desc);
                    pc.setLocalDescription(desc, function () {
                        console.log('setLocalDescription', pc.localDescription);
                        socket.emit('exchange', { 'to': fromId, 'sdp': pc.localDescription });
                    }, logError);
                }, logError);
        }, logError);
    } else {
        console.log('exchange candidate', data);
        pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
}

function mute(socketId) {
    console.log('leave', socketId);
    const pc = pcPeers[socketId];
    pc.mute();
}

function leave(socketId) {
    console.log('leave', socketId);

    /* const pc = pcPeers[socketId];
    const viewIndex = pc.viewIndex;
    pc.close();
    delete pcPeers[socketId];

    const remoteList = container.state.remoteList;
    delete remoteList[socketId]
    container.setState({ remoteList: remoteList });
    container.setState({ info: 'One peer leave!' }); */
}

function logError(error) {
    console.log("logError", error);
}

function getStats() {
    const pc = pcPeers[Object.keys(pcPeers)[0]];
    if (pc.getRemoteStreams()[0] && pc.getRemoteStreams()[0].getAudioTracks()[0]) {
        const track = pc.getRemoteStreams()[0].getAudioTracks()[0];
        console.log('track', track);
        pc.getStats(track, function (report) {
            console.log('getStats report', report);
        }, logError);
    }
}

let container;

type Props = {};
export default class Broadcast extends Component<Props> {
    constructor() {
        super();
        // this.ds = new ListView.DataSource({ rowHasChanged: (r1, r2) => true });

        this.state = {
            info: 'Initializing',
            status: 'init',
            roomID: '',
            isFront: true,
            selfViewSrc: null,
            remoteList: {},
            textRoomConnected: false,
        };
    }

    componentDidMount() {
        this.props.navigation.setParams({ name: 'Broadcasting' })
        container = this;
        const roomID = this.props.navigation.getParam('roomID', null);
        isBroadcaster = this.props.navigation.getParam('broadcaster', true);

        socket = io.connect('https://aostream-webrtc-server.herokuapp.com', { transports: ['websocket'] });

        socket.on('exchange', function (data) {
            exchange(data);
        });
        socket.on('leave', function (socketId) {
            leave(socketId);
        });
        
        socket.on('connect', function (data) {
            console.log('connect');
        
            getLocalStream(true, function (stream) {
                console.log(stream);
                localStream = stream;
                container.setState({ selfViewSrc: stream.toURL() });
                container.setState({ status: 'ready', info: 'Please enter or create room ID' });
            });
        });

        this.setState({ status: 'connect', info: 'Connecting', roomID: roomID });
        join(roomID);
    }

    /* receiveTextData = (data) => {
        const textRoomData = this.state.textRoomData.slice();
        textRoomData.push(data);
        this.setState({ textRoomData, textRoomValue: '' });
    }

    _switchVideoType = () => {
        const isFront = !this.state.isFront;
        this.setState({ isFront });
        getLocalStream(isFront, function (stream) {
            if (localStream) {
                for (const id in pcPeers) {
                    const pc = pcPeers[id];
                    pc && pc.removeStream(localStream);
                }
                localStream.release();
            }
            localStream = stream;
            container.setState({ selfViewSrc: stream.toURL() });

            for (const id in pcPeers) {
                const pc = pcPeers[id];
                pc && pc.addStream(localStream);
            }
        });
    }

    _textRoomPress = () => {
        if (!this.state.textRoomValue) {
            return
        }
        const textRoomData = this.state.textRoomData.slice();
        textRoomData.push({ user: 'Me', message: this.state.textRoomValue });
        for (const key in pcPeers) {
            const pc = pcPeers[key];
            pc.textDataChannel.send(this.state.textRoomValue);
        }
        this.setState({ textRoomData, textRoomValue: '' });
    }

    _renderTextRoom = () => {
        return (
            <View style={styles.listViewContainer}>
                <ListView
                    dataSource={// .cloneWithRows(this.state.textRoomData)}
                    renderRow={rowData => <Text>{`${rowData.user}: ${rowData.message}`}</Text>}
                />
                <TextInput
                    style={{ width: 200, height: 30, borderColor: 'gray', borderWidth: 1 }}
                    onChangeText={value => this.setState({ textRoomValue: value })}
                    value={this.state.textRoomValue}
                />
                <TouchableHighlight
                    onPress={this._textRoomPress}>
                    <Text>Send</Text>
                </TouchableHighlight>
            </View>
        );
    } */

    _leave = () => {
        socket.disconnect()
        this.props.navigation.goBack()
    }

    render() {
        return (
            <View style={styles.container}>
                <Text style={styles.welcome}>{isBroadcaster ? 'Broadcasting on' : 'Listening to'}: {this.state.roomID}</Text>

                <TouchableHighlight style={styles.button} onPress={this._leave}>
                    <Text style={styles.buttonText}>Leave Broadcast</Text>
                </TouchableHighlight>

                <RTCView streamURL={this.state.videoURL} />
            </View>
        );
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#2b608a',
    },
    welcome: {
        fontSize: 20,
        textAlign: 'center',
        margin: 10,
        color: '#fff',
    },

    button: {
        padding: 20
    },
    buttonText: {
        fontSize: 20,
        color: "#B81F00",
        textAlign: 'center',
    },
});