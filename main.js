// 全局变量声明
let net = null;
let c, ctx, video;
let canvasVideoSize = {'width':640,'height':480};
let status;
let isProcessing = false;
let FPS = 15;
let frameInterval = 1000 / FPS;
let lastFrameTime = 0;
let detectionThreshold = 0.3;
let loadingOverlay;
let frameCount = 0;
let lastFpsUpdate = 0;
let detectionCount = 0;
let isAbstractMode = false;

// DOM加载完成后初始化
window.addEventListener('DOMContentLoaded', function() {
    // 初始化DOM元素
    c = document.getElementById('draw');
    ctx = c.getContext('2d');
    status = document.getElementById('status');
    video = document.getElementById('video');
    loadingOverlay = document.getElementById('loading-overlay');

    // 初始化控制面板
    initControls();

    // 显示加载提示
    loadingOverlay.style.display = 'flex';

    // 加载模型
    loadModel().then(() => {
        // 隐藏加载提示
        loadingOverlay.style.display = 'none';
        // 初始化摄像头
        initCamera();
    }).catch(error => {
        console.error('模型加载失败:', error);
        status.innerText = '模型加载失败，请刷新页面重试';
        loadingOverlay.style.display = 'none';
    });
});

// 初始化控制面板
function initControls() {
    // 检测阈值控制
    const thresholdSlider = document.getElementById('threshold');
    const thresholdValue = document.getElementById('threshold-value');
    thresholdSlider.addEventListener('input', function(e) {
        detectionThreshold = parseFloat(e.target.value);
        thresholdValue.textContent = detectionThreshold.toFixed(1);
    });

    // FPS控制
    const fpsSlider = document.getElementById('fps-control');
    const fpsValue = document.getElementById('fps-value');
    fpsSlider.addEventListener('input', function(e) {
        FPS = parseInt(e.target.value);
        frameInterval = 1000 / FPS;
        fpsValue.textContent = FPS;
    });

    // 模式切换
    const normalModeBtn = document.getElementById('normal-mode');
    const abstractModeBtn = document.getElementById('abstract-mode');
    const videoContainer = document.querySelector('.video-container');

    normalModeBtn.addEventListener('click', () => {
        isAbstractMode = false;
        normalModeBtn.classList.add('active');
        abstractModeBtn.classList.remove('active');
        videoContainer.classList.remove('abstract-mode');
    });

    abstractModeBtn.addEventListener('click', () => {
        isAbstractMode = true;
        abstractModeBtn.classList.add('active');
        normalModeBtn.classList.remove('active');
        videoContainer.classList.add('abstract-mode');
    });
}

// 初始化摄像头
function initCamera() {
    let mediaConfig = {     
        'audio': false,
        'video': {
            facingMode: 'user',
            width: 640,
            height: 480,
        }
    };

    if(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia(mediaConfig)
            .then(function(stream) {
                video.srcObject = stream;
                video.play();
                video.onloadeddata = function(){
                    step(video);
                }
            })
            .catch(e => {
                addLog('无法访问摄像头，请检查设备和权限设置', 'error');
                status.innerText = '无法访问摄像头，请检查设备和权限设置';
            });
    }
}

// 加载模型
async function loadModel() {
    status.innerText = '正在加载模型...';
    net = await posenet.load({
        architecture: 'MobileNetV1',
        outputStride: 16,
        multiplier: 0.75,
        quantBytes: 2
    });
    status.innerText = '模型加载完成';
}

// 添加日志函数
function addLog(message, type = 'info') {
    const logContent = document.getElementById('log-content');
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logContent.insertBefore(entry, logContent.firstChild);
    
    // 限制日志条数
    if (logContent.children.length > 50) {
        logContent.removeChild(logContent.lastChild);
    }
}

// 姿态检测
async function pose(o) {
    if(!net) return;
    const startTime = performance.now();
    
    const pose = await net.estimateMultiplePoses(o, {
        flipHorizontal: false,
        scoreThreshold: detectionThreshold,
        nmsRadius: 20
    });
    
    const endTime = performance.now();
    const detectionTime = (endTime - startTime).toFixed(1);
    
    status.innerText = '';
    addLog(`检测完成: 发现 ${pose.length} 个人体 (耗时: ${detectionTime}ms)`);
    detectionCount += pose.length;
    document.getElementById('detection-count').textContent = detectionCount;
    
    if(pose.length > 0) {
        ctx.clearRect(0, 0, c.width, c.height);
        c.width = canvasVideoSize.width;
        c.height = canvasVideoSize.height;
        c.style.height = canvasVideoSize.height + 'px';
        c.style.width = canvasVideoSize.width + 'px';
        
        if (isAbstractMode) {
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(0, 0, c.width, c.height);
        }
        
        pose.forEach(p => {
            if(p.score > detectionThreshold) {
                if (isAbstractMode) {
                    drawAbstractHead(p.keypoints);
                }
                
                p.keypoints.forEach(e => {
                    draw(e, isAbstractMode);
                });
                const adjacentKeyPoints = posenet.getAdjacentKeyPoints(p.keypoints, detectionThreshold);
                adjacentKeyPoints.forEach((e) => {
                    drawSkeleton(e, isAbstractMode);
                });
            }
        });
    } else {
        addLog('未检测到人体', 'warning');
    }
}

// 绘制关键点
function draw(e, isAbstract) {
    ctx.beginPath();
    if (isAbstract) {
        ctx.fillStyle = `rgba(255, 255, 255, ${e.score})`;
        ctx.arc(e.position.x, e.position.y, 4, 0, 2 * Math.PI);
        ctx.fill();
    } else {
        ctx.fillStyle = `rgba(0, 255, 255, ${e.score})`;
        ctx.fillRect(e.position.x-2, e.position.y-2, 4, 4);
    }
}

// 绘制骨架
function drawSkeleton(e, isAbstract) {
    ctx.beginPath();
    ctx.moveTo(e[0].position.x, e[0].position.y);
    ctx.lineTo(e[1].position.x, e[1].position.y);
    ctx.lineWidth = isAbstract ? 3 : 2;
    const avgScore = (e[0].score + e[1].score) / 2;
    if (isAbstract) {
        ctx.strokeStyle = `rgba(255, 255, 255, ${avgScore})`;
        ctx.lineCap = 'round';
    } else {
        ctx.strokeStyle = `rgba(0, 255, 255, ${avgScore})`;
        ctx.lineCap = 'butt';
    }
    ctx.stroke();
}

// 添加抽象头部绘制函数
function drawAbstractHead(keypoints) {
    // 获取面部关键点
    const nose = keypoints.find(k => k.part === 'nose');
    const leftEye = keypoints.find(k => k.part === 'leftEye');
    const rightEye = keypoints.find(k => k.part === 'rightEye');
    const leftEar = keypoints.find(k => k.part === 'leftEar');
    const rightEar = keypoints.find(k => k.part === 'rightEar');
    const leftShoulder = keypoints.find(k => k.part === 'leftShoulder');
    const rightShoulder = keypoints.find(k => k.part === 'rightShoulder');
    
    // 确保所有需要的关键点都被检测到
    if (nose && nose.score > 0.5 && leftEye && rightEye) {
        // 计算头部中心点（以鼻子为基准）
        const centerX = nose.position.x;
        const centerY = nose.position.y;
        
        // 计算头部大小（基于眼睛间距）
        const eyeDistance = Math.sqrt(
            Math.pow(rightEye.position.x - leftEye.position.x, 2) +
            Math.pow(rightEye.position.y - leftEye.position.y, 2)
        );
        
        // 头部半径（眼睛间距的1.5倍）
        const headRadius = eyeDistance * 1.5;
        
        // 绘制虚拟脖子
        if (leftShoulder && rightShoulder && 
            leftShoulder.score > 0.5 && rightShoulder.score > 0.5) {
            
            // 计算肩部中心点
            const shoulderCenterX = (leftShoulder.position.x + rightShoulder.position.x) / 2;
            const shoulderCenterY = (leftShoulder.position.y + rightShoulder.position.y) / 2;
            
            // 计算脖子起点（头部底部）
            const neckStartX = centerX;
            const neckStartY = centerY + headRadius * 0.8;
            
            // 计算脖子终点（肩部中心稍微往上）
            const neckEndX = shoulderCenterX;
            const neckEndY = shoulderCenterY - 20;
            
            // 绘制脖子曲线
            ctx.beginPath();
            ctx.moveTo(neckStartX, neckStartY);
            
            // 使用直线代替曲线
            ctx.lineTo(neckEndX, neckEndY);
            
            // 设置脖子样式
            const avgShoulderScore = (leftShoulder.score + rightShoulder.score) / 2;
            ctx.strokeStyle = `rgba(255, 255, 255, ${avgShoulderScore})`;
            ctx.lineWidth = 3;  // 与骨架线条相同的粗细
            ctx.lineCap = 'round';
            ctx.stroke();
        }
        
        // 绘制头部轮廓
        ctx.beginPath();
        ctx.arc(centerX, centerY, headRadius, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // 如果检测到耳朵，添加一些细节
        if (leftEar && leftEar.score > 0.5 && rightEar && rightEar.score > 0.5) {
            // 绘制简单的耳朵轮廓
            const earSize = headRadius * 0.3;
            
            // 左耳
            ctx.beginPath();
            ctx.arc(leftEar.position.x, leftEar.position.y, earSize, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            
            // 右耳
            ctx.beginPath();
            ctx.arc(rightEar.position.x, rightEar.position.y, earSize, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        // 添加简单的面部表情
        if (nose.score > 0.8) {
            // 眼睛
            const eyeSize = headRadius * 0.1;
            
            // 左眼
            ctx.beginPath();
            ctx.arc(leftEye.position.x, leftEye.position.y, eyeSize, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.fill();
            
            // 右眼
            ctx.beginPath();
            ctx.arc(rightEye.position.x, rightEye.position.y, eyeSize, 0, Math.PI * 2);
            ctx.fill();
            
            // 微笑线条
            ctx.beginPath();
            ctx.arc(centerX, centerY + headRadius * 0.2, headRadius * 0.3, 0.1 * Math.PI, 0.9 * Math.PI);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }
}

// 动画循环
function step(timestamp) {
    if (timestamp - lastFrameTime < frameInterval) {
        window.requestAnimationFrame(step);
        return;
    }
    
    // 更新FPS显示
    frameCount++;
    if (timestamp - lastFpsUpdate >= 1000) {
        const fps = Math.round((frameCount * 1000) / (timestamp - lastFpsUpdate));
        document.getElementById('current-fps').textContent = fps;
        frameCount = 0;
        lastFpsUpdate = timestamp;
    }
    
    lastFrameTime = timestamp;
    
    if (!isProcessing) {
        isProcessing = true;
        pose(video)
            .finally(() => {
                isProcessing = false;
                window.requestAnimationFrame(step);
            });
    }
}

// 返回顶部功能
window.addEventListener('scroll', function() {
    const backToTop = document.querySelector('.back-to-top');
    if (window.scrollY > 300) {
        backToTop.classList.add('visible');
    } else {
        backToTop.classList.remove('visible');
    }
});

function scrollToTop() {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
} 