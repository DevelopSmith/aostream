import React, { Component } from 'react';
import { StyleSheet, Text, TouchableHighlight, View, Platform } from 'react-native';

import io from 'socket.io-client';
import { RTCPeerConnection, RTCMediaStream, RTCIceCandidate, RTCSessionDescription, RTCView, MediaStreamTrack, mediaDevices, getUserMedia } from 'react-native-webrtc';

import Sound from 'react-native-sound';
import { AudioRecorder, AudioUtils } from 'react-native-audio';

const socket = io.connect('https://react-native-webrtc.herokuapp.com', { transports: ['websocket'] });
const configuration = { "iceServers": [{ "url": "stun:stun.l.google.com:19302" }] };

const pcPeers = {};
let localStream;
let isBroadcaster = true;
let thePC = null;

function getLocalStream(isFront, callback) {
    let videoSourceId;

    // on android, you don't have to specify sourceId manually, just use facingMode
    // uncomment it if you want to specify
    /* if (Platform.OS === 'ios') {
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
    thePC.close();

    /* const pc = pcPeers[socketId];
    const viewIndex = pc.viewIndex;
    pc.close();
    delete pcPeers[socketId];

    const remoteList = container.state.remoteList;
    delete remoteList[socketId]
    container.setState({ remoteList: remoteList });
    container.setState({ info: 'One peer leave!' }); */
}

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
            textRoomData: [],
            textRoomValue: '',

            currentTime: 0.0,
            recording: false,
            paused: false,
            stoppedRecording: false,
            finished: false,
            audioPath: AudioUtils.DocumentDirectoryPath + '/test.aac',
            hasPermission: undefined,
        };
    }

    prepareRecordingPath(audioPath) {
        AudioRecorder.prepareRecordingAtPath(audioPath, {
            SampleRate: 22050,
            Channels: 1,
            AudioQuality: "Low",
            AudioEncoding: "aac",
            AudioEncodingBitRate: 32000
        });
    }

    start = () => {
        AudioRecorder.requestAuthorization().then((isAuthorised) => {
            this.setState({ hasPermission: isAuthorised });

            if (!isAuthorised) return;

            this.prepareRecordingPath(this.state.audioPath);

            AudioRecorder.onProgress = (data) => {
                this.setState({ currentTime: Math.floor(data.currentTime) });
            };

            AudioRecorder.onFinished = (data) => {
                // Android callback comes in the form of a promise instead.
                if (Platform.OS === 'ios') {
                    this._finishRecording(data.status === "OK", data.audioFileURL, data.audioFileSize);
                }
            };
        });
    }

    componentDidMount() {
        this.props.navigation.setParams({ name: 'Broadcasting' })
        container = this;
        const roomID = this.props.navigation.getParam('roomID', null);
        isBroadcaster = this.props.navigation.getParam('broadcaster', true);

        if (roomID) {
            this.setState({ status: 'connect', info: 'Connecting', roomID: roomID });
            join(roomID);
            this.start();
        }
    }

    receiveTextData = (data) => {
        const textRoomData = this.state.textRoomData.slice();
        textRoomData.push(data);
        this.setState({ textRoomData, textRoomValue: '' });
    }

    /* _switchVideoType = () => {
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

    _renderButton(title, onPress, active) {
        var style = (active) ? styles.activeButtonText : styles.buttonText;

        return (
            <TouchableHighlight style={styles.button} onPress={onPress}>
                <Text style={style}>{title}</Text>
            </TouchableHighlight>
        );
    }

    _renderPauseButton(onPress, active) {
        var style = (active) ? styles.activeButtonText : styles.buttonText;
        var title = this.state.paused ? "RESUME" : "PAUSE";
        return (
            <TouchableHighlight style={styles.button} onPress={onPress}>
                <Text style={style}>
                    {title}
                </Text>
            </TouchableHighlight>
        );
    }

    async _pause() {
        if (!this.state.recording) {
            console.log('Can\'t pause, not recording!');
            return;
        }

        try {
            const filePath = await AudioRecorder.pauseRecording();
            this.setState({ paused: true });
        } catch (error) {
            console.error(error);
        }
    }

    async _resume() {
        if (!this.state.paused) {
            console.log('Can\'t resume, not paused!');
            return;
        }

        try {
            await AudioRecorder.resumeRecording();
            this.setState({ paused: false });
        } catch (error) {
            console.error(error);
        }
    }

    async _stop() {
        if (!this.state.recording) {
            console.log('Can\'t stop, not recording!');
            return;
        }

        this.setState({ stoppedRecording: true, recording: false, paused: false });

        try {
            const filePath = await AudioRecorder.stopRecording();

            if (Platform.OS === 'android') {
                this._finishRecording(true, filePath);
            }
            return filePath;
        } catch (error) {
            console.error(error);
        }
    }

    async _play() {
        if (this.state.recording) {
            await this._stop();
        }

        // These timeouts are a hacky workaround for some issues with react-native-sound.
        // See https://github.com/zmxv/react-native-sound/issues/89.
        setTimeout(() => {
            var sound = new Sound(this.state.audioPath, '', (error) => {
                if (error) {
                    console.log('failed to load the sound', error);
                }
            });

            setTimeout(() => {
                sound.play((success) => {
                    if (success) {
                        console.log('successfully finished playing');
                    } else {
                        console.log('playback failed due to audio decoding errors');
                    }
                });
            }, 100);
        }, 100);
    }

    async _record() {
        if (this.state.recording) {
            console.log('Already recording!');
            return;
        }

        if (!this.state.hasPermission) {
            console.log('Can not record, no permission granted!');
            return;
        }

        if (this.state.stoppedRecording) {
            this.prepareRecordingPath(this.state.audioPath);
        }

        this.setState({ recording: true, paused: false });

        try {
            AudioRecorder.startRecording();
        } catch (error) {
            console.log(error);
        }
    }

    _finishRecording(didSucceed, filePath, fileSize) {
        this.setState({ finished: didSucceed });
        console.log(`Finished recording of duration ${this.state.currentTime} seconds at path: ${filePath} and size of ${fileSize || 0} bytes`);
    }

    _leave = () => {
        leave();
        this.props.navigation.goBack()
    }

    render() {
        return (
            <View style={styles.container}>
                <Text style={styles.welcome}>{isBroadcaster ? 'Broadcasting on' : 'Listening to'}: {this.state.roomID}</Text>

                <View style={styles.controls}>
                    {thePC ? this._renderButton("LEAVE", () => { this._leave() }) : null}

                    {this._renderButton("RECORD", () => { this._record() }, this.state.recording)}
                    {this._renderButton("PLAY", () => { this._play() })}
                    {this._renderButton("STOP", () => { this._stop() })}
                    {/* {this._renderButton("PAUSE", () => {this._pause()} )} */}
                    {this._renderPauseButton(() => { this.state.paused ? this._resume() : this._pause() })}
                    <Text style={styles.progressText}>{this.state.currentTime}s</Text>
                </View>

                <RTCView streamURL={this.state.videoURL} />
            </View>
        );
    }
}

const styles = StyleSheet.create({
    selfView: {
        width: 200,
        height: 150,
    },
    remoteView: {
        width: 200,
        height: 150,
    },
    container: {
        flex: 1,
        justifyContent: 'center',
        backgroundColor: '#2b608a',
    },
    welcome: {
        fontSize: 20,
        textAlign: 'center',
        margin: 10,
        color: '#fff',
    },
    listViewContainer: {
        height: 150,
    },

    controls: {
        justifyContent: 'center',
        alignItems: 'center',
        flex: 1,
    },
    progressText: {
        paddingTop: 50,
        fontSize: 50,
        color: "#fff"
    },
    button: {
        padding: 20
    },
    disabledButtonText: {
        color: '#eee'
    },
    buttonText: {
        fontSize: 20,
        color: "#fff"
    },
    activeButtonText: {
        fontSize: 20,
        color: "#B81F00"
    }
});