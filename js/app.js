/* global OT APPLICATION_ID TOKEN SESSION_ID SAMPLE_SERVER_BASE_URL mqtt */

let applicationId;
let sessionId;
let token;

const publishVideoTrueBtn = document.querySelector('#publish-video-true');
const publishVideoFalseBtn = document.querySelector('#publish-video-false');

function handleError(error) {
  if (error) {
    console.error(error);
  }
}

function initializeSession() {
  const session = OT.initSession(applicationId, sessionId);

  // Subscribe to a newly created stream
  session.on('streamCreated', (event) => {
    const subscriberOptions = {
      insertMode: 'append',
      width: '100%',
      height: '100%'
    };
    session.subscribe(event.stream, 'subscriber', subscriberOptions, handleError);
  });

  session.on('sessionDisconnected', (event) => {
    console.log('You were disconnected from the session.', event.reason);
  });

  // initialize the publisher
  const publisherOptions = {
    insertMode: 'append',
    width: '100%',
    height: '100%',
    resolution: '1280x720',
    publishVideo: false // Start with video off
  };
  const publisher = OT.initPublisher('publisher', publisherOptions, handleError);

  // // fires if user revokes permission to camera and/or microphone
  // publisher.on('accessDenied', (event) => {
  //   alert(event?.message);
  // });
  // fires if user revokes permission to camera and/or microphone
  publisher.on('accessDenied', (event) => {
    alert(event?.message);
  });
  
  // Connect to the session
  session.connect(token, (error) => {
    if (error) {
      handleError(error);
    } else {
      // If the connection is successful, publish the publisher to the session
      // should be activated ondemand
      // session.publish(publisher, handleError);
      session.publish(publisher, handleError); // This will now publish with video off
    }
  });

  publishVideoTrueBtn.addEventListener('click',() => {
    publisher.publishVideo(true, (error) => {
      if (error) {
        handleError(error);
      } else {
        publishVideoTrueBtn.style.display = 'none';
        publishVideoFalseBtn.style.display = 'block';
        // The buttons are for toggling an existing published stream
        // We can add UI feedback here if needed
      }
    });
  });

  publishVideoFalseBtn.addEventListener('click',() => {
    publisher.publishVideo(false, (error) => {
      if (error) {
          alert('error: ', error);
      } else {
        publishVideoFalseBtn.style.display = 'none';
        publishVideoTrueBtn.style.display = 'block';
        // The buttons are for toggling an existing published stream
        // We can add UI feedback here if needed
      }
    });
  });

}

const startBtn = document.getElementById('start-btn');
const startContainer = document.getElementById('start-container');

startBtn.addEventListener('click', () => {
  startContainer.style.display = 'none';
  // See the config.js file.
  if (APPLICATION_ID && TOKEN && SESSION_ID) {
    applicationId = APPLICATION_ID;
    sessionId = SESSION_ID;
    token = TOKEN;
    initializeSession();
  } else if (SAMPLE_SERVER_BASE_URL) {
    // Make a GET request to get the Vonage Video Application ID, session ID, and token from the server
    fetch(SAMPLE_SERVER_BASE_URL + '/session')
    .then((response) => response.json())
    .then((json) => {
      applicationId = json.applicationId;
      sessionId = json.sessionId;
      token = json.token;
      // Initialize an Vonage Video Session object
      initializeSession();
    }).catch((error) => {
      handleError(error);
      alert('Failed to get Vonage Video sessionId and token. Make sure you have updated the config.js file.');
    });
  }
});

// --- MQTT Logic ---
const MQTT_HOST = 'wss://c22d3035.ala.us-east-1.emqxsl.com:8084';
// const MQTT_OPTIONS = {
//   username: 'ehrmgbrf:ehrmgbrf',
//   password: 'GttkZpysYlR3szHNwf2_zkjzeaeigGn-',
// };
const MQTT_OPTIONS = {
  username: 'Botler',
  password: 'Botler',
  path: '/mqtt',
};
const MQTT_TOPIC = 'joystick/moves';
const ARM_MQTT_TOPIC = 'robot/arm';
const GRIPPER_MQTT_TOPIC = 'robot/gripper';
const MQTT_PUBLISH_OPTIONS = {
  qos: 1,
  retain: false,
};

const mqttClient = mqtt.connect(MQTT_HOST, MQTT_OPTIONS);

mqttClient.on('connect', () => {
  console.log('Connected to MQTT broker');
});

mqttClient.on('error', (err) => {
  console.error('MQTT Connection error: ', err);
  mqttClient.end();
});

mqttClient.on('offline', () => {
  console.log('MQTT client is offline');
});

const stopBtn = document.getElementById('stop-btn');
if (stopBtn) {
  stopBtn.addEventListener('click', () => {
    console.log('Joystick: stop');
    mqttClient.publish(MQTT_TOPIC, 'stop', MQTT_PUBLISH_OPTIONS, (err) => {
      if (err) console.error('MQTT stop publish error:', err);
    });
  });
}
// --- Joystick Logic ---

const joystick = document.getElementById('joystick');
const joystickStick = document.getElementById('joystick-stick');

if (joystick && joystickStick) {
  const centerX = 50;
  const centerY = 50;
  const stickRadius = parseFloat(joystickStick.getAttribute('r'));
  // Assuming the base is the first circle in the SVG
  const baseRadius = parseFloat(joystick.querySelector('.joystick-base').getAttribute('r'));
  const maxDistance = baseRadius - stickRadius;

  let isDragging = false;
  let lastLoggedAngle = -1;
  let lastLoggedDirection = null;

  const getDirection = (degrees) => {
    if ((degrees >= 315 && degrees <= 360) || (degrees >= 0 && degrees < 45)) {
      return 'right';
    }
    if (degrees >= 45 && degrees < 135) {
      return 'back';
    }
    if (degrees >= 135 && degrees < 225) {
      return 'left';
    }
    if (degrees >= 225 && degrees < 315) {
      return 'forward';
    }
    return null;
  };

  const getPointerPositionInSVG = (event) => {
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;
    const rect = joystick.getBoundingClientRect();
    const scaleX = joystick.viewBox.baseVal.width / rect.width;
    const scaleY = joystick.viewBox.baseVal.height / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    return { x, y };
  };

  const onDragStart = (event) => {
    isDragging = true;
    if (event.type === 'touchstart') {
      event.preventDefault();
      window.addEventListener('touchmove', onDragMove, { passive: false });
      window.addEventListener('touchend', onDragEnd);
      window.addEventListener('touchcancel', onDragEnd);
    } else {
      window.addEventListener('mousemove', onDragMove);
      window.addEventListener('mouseup', onDragEnd);
    }
  };

  const onDragMove = (event) => {
    if (!isDragging) return;
    if (event.type === 'touchmove') {
      event.preventDefault();
    }

    const { x, y } = getPointerPositionInSVG(event);

    const dx = x - centerX;
    const dy = y - centerY;

    let distance = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);

    if (distance > maxDistance) {
      distance = maxDistance;
    }

    const newX = centerX + distance * Math.cos(angle);
    const newY = centerY + distance * Math.sin(angle);
    joystickStick.setAttribute('cx', newX);
    joystickStick.setAttribute('cy', newY);

    let degrees = angle * (180 / Math.PI);
    if (degrees < 0) {
      degrees += 360;
    }

    // Deadzone check to only log when the stick is moved significantly
    if (distance > maxDistance / 4) {
      const direction = getDirection(degrees);
      if (direction && direction !== lastLoggedDirection) {
        console.log(`Joystick: ${direction}`);
        mqttClient.publish(MQTT_TOPIC, direction, MQTT_PUBLISH_OPTIONS, (err) => {
          if (err) console.error('MQTT publish error:', err);
        });
        lastLoggedDirection = direction;
      }
    } else if (lastLoggedDirection !== null) {
      console.log('Joystick: centered');
      lastLoggedDirection = null;
      mqttClient.publish(MQTT_TOPIC, 'centered', MQTT_PUBLISH_OPTIONS, (err) => {
        if (err) console.error('MQTT publish error:', err);
      });
    }
  };

  const onDragEnd = () => {
    if (!isDragging) return;
    isDragging = false;

    joystickStick.setAttribute('cx', centerX);
    joystickStick.setAttribute('cy', centerY);
    lastLoggedAngle = -1; // Reset for next drag
    if (lastLoggedDirection !== null) {
      console.log('Joystick: centered');
      mqttClient.publish(MQTT_TOPIC, 'centered', MQTT_PUBLISH_OPTIONS, (err) => {
        if (err) console.error('MQTT publish error:', err);
      });
      lastLoggedDirection = null;
    }

    window.removeEventListener('mousemove', onDragMove);
    window.removeEventListener('mouseup', onDragEnd);
    window.removeEventListener('touchmove', onDragMove);
    window.removeEventListener('touchend', onDragEnd);
    window.removeEventListener('touchcancel', onDragEnd);
  };

  joystick.addEventListener('mousedown', onDragStart);
  joystick.addEventListener('touchstart', onDragStart, { passive: false });
}

// --- Arm Joystick & Gripper Logic ---

const armJoystick = document.getElementById('arm-joystick');
const armJoystickStick = document.getElementById('arm-joystick-stick');
const gripperSlider = document.getElementById('gripper-slider');

/**
 * Maps a value from one range to another.
 */
const map_range = (value, in_min, in_max, out_min, out_max) => {
  return (value - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
};

if (gripperSlider) {
  gripperSlider.addEventListener('input', (event) => {
    const gripperValue = event.target.value;
    console.log(`Gripper: ${gripperValue}`);
    mqttClient.publish(GRIPPER_MQTT_TOPIC, gripperValue, MQTT_PUBLISH_OPTIONS, (err) => {
      if (err) console.error('MQTT gripper publish error:', err);
    });
  });
}

if (armJoystick && armJoystickStick) {
  const armCenterX = 50;
  const armCenterY = 50;
  const armStickRadius = parseFloat(armJoystickStick.getAttribute('r'));
  const armBaseRadius = parseFloat(armJoystick.querySelector('.joystick-base').getAttribute('r'));
  const armMaxDistance = armBaseRadius - armStickRadius;

  let isArmDragging = false;
  let lastArmPosition = null;

  const getArmPointerPositionInSVG = (event) => {
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;
    const rect = armJoystick.getBoundingClientRect();
    const scaleX = armJoystick.viewBox.baseVal.width / rect.width;
    const scaleY = armJoystick.viewBox.baseVal.height / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    return { x, y };
  };

  const onArmDragStart = (event) => {
    isArmDragging = true;
    if (event.type === 'touchstart') {
      event.preventDefault();
      window.addEventListener('touchmove', onArmDragMove, { passive: false });
      window.addEventListener('touchend', onArmDragEnd);
      window.addEventListener('touchcancel', onArmDragEnd);
    } else {
      window.addEventListener('mousemove', onArmDragMove);
      window.addEventListener('mouseup', onArmDragEnd);
    }
  };

  const onArmDragMove = (event) => {
    if (!isArmDragging) return;
    if (event.type === 'touchmove') {
      event.preventDefault();
    }

    const { x, y } = getArmPointerPositionInSVG(event);

    const dx = x - armCenterX;
    const dy = y - armCenterY;

    let distance = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);

    if (distance > armMaxDistance) {
      distance = armMaxDistance;
    }

    const newX = armCenterX + distance * Math.cos(angle);
    const newY = armCenterY + distance * Math.sin(angle);
    armJoystickStick.setAttribute('cx', newX);
    armJoystickStick.setAttribute('cy', newY);

    // Deadzone check
    if (distance > armMaxDistance / 4) {
      // Normalize coordinates to -1.0 to 1.0 range
      const normalizedX = (newX - armCenterX) / armMaxDistance;
      const normalizedY = (newY - armCenterY) / armMaxDistance;

      // Map directly to servo angles (0-180)
      const panAngle = Math.round(map_range(normalizedX, -1, 1, 0, 180));
      const tiltAngle = Math.round(map_range(normalizedY, -1, 1, 180, 0)); // Inverted for intuitive control

      const armPosition = `${panAngle},${tiltAngle}`;

      // Only publish if position has changed
      if (armPosition !== lastArmPosition) {
        console.log(`Arm Angles: Pan=${panAngle}, Tilt=${tiltAngle}`);
        mqttClient.publish(ARM_MQTT_TOPIC, armPosition, MQTT_PUBLISH_OPTIONS, (err) => {
          if (err) console.error('MQTT arm publish error:', err);
        });
        lastArmPosition = armPosition;
      }
    } else if (lastArmPosition !== null) {
      console.log('Arm Angles: centered (90,90)');
      lastArmPosition = null;
      mqttClient.publish(ARM_MQTT_TOPIC, '90,90', MQTT_PUBLISH_OPTIONS, (err) => {
        if (err) console.error('MQTT arm publish error:', err);
      });
    }
  };

  const onArmDragEnd = () => {
    if (!isArmDragging) return;
    isArmDragging = false;

    armJoystickStick.setAttribute('cx', armCenterX);
    armJoystickStick.setAttribute('cy', armCenterY);

    if (lastArmPosition !== null) {
      console.log('Arm Angles: centered (90,90)');
      mqttClient.publish(ARM_MQTT_TOPIC, '90,90', MQTT_PUBLISH_OPTIONS, (err) => {
        if (err) console.error('MQTT arm publish error:', err);
      });
      lastArmPosition = null;
    }

    window.removeEventListener('mousemove', onArmDragMove);
    window.removeEventListener('mouseup', onArmDragEnd);
    window.removeEventListener('touchmove', onArmDragMove);
    window.removeEventListener('touchend', onArmDragEnd);
    window.removeEventListener('touchcancel', onArmDragEnd);
  };

  armJoystick.addEventListener('mousedown', onArmDragStart);
  armJoystick.addEventListener('touchstart', onArmDragStart, { passive: false });
}
