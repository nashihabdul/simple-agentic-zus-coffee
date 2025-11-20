const container = document.querySelector(".container");
const chatsContainer = document.getElementById('chats');
const promptForm = document.querySelector(".prompt-form");
const promptInput = promptForm.querySelector(".prompt-input");
const fileInput = promptForm.querySelector("#file-input");
const fileUploadWrapper = promptForm.querySelector(".file-upload-wrapper");
const themeToggle = document.querySelector("#theme-toggle-btn");

let typingInterval, controller;
const chatHistory = JSON.parse(localStorage.getItem("chatHistory")) || [];

const userData = { message: "", file: {} };

function renderChatHistory() {
    if (!chatHistory.length) return;

    chatsContainer.innerHTML = "";

    chatHistory.forEach(item => {
        let msgHTML = `<p class="message-text"></p>`;

        if (item.role === "bot") {
            msgHTML = `<img src="./assets/chatbot.svg" alt="" class="avatar"><p class="message-text"></p>`;
        }

        const msgDiv = createMsgElement(
            msgHTML,
            item.role === "user" ? "user-message" : "bot-message"
        );

        msgDiv.querySelector(".message-text").innerHTML = marked.parse(item.message);
        chatsContainer.appendChild(msgDiv);
    });

    scrollToBottom();
}

function saveChatHistory() {
    localStorage.setItem("chatHistory", JSON.stringify(chatHistory));
}

function buildMessagePayload() {
    return chatHistory.map(item => item.message);
}

function dedent(str) {
  str = String(str || "");
  const lines = str.split('\n');
  let minIndent = Infinity;

  for (const line of lines) {
    if (line.trim().length === 0) continue;
    const indent = line.match(/^\s*/)[0].length;
    minIndent = Math.min(minIndent, indent);
  }

  return lines.map(line => line.slice(minIndent)).join('\n');
}

const createMsgElement = (content, ...classes) => {
    const div = document.createElement("div");
    div.classList.add("message", ...classes);
    div.innerHTML = content;
    return div;
}

const scrollToBottom = () => container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });

const typingEffect = (text, textElement, botMsgDiv, onFinish = () => {}) => {
    textElement.textContent = "";
    const words = text.split(" ");
    let wordIndex = 0;

    typingInterval = setInterval(() => {
        if (wordIndex < words.length) {
            textElement.textContent += (wordIndex === 0 ? "" : " ") + words[wordIndex++];
            // scrollToBottom();
        } else {
            clearInterval(typingInterval);
            botMsgDiv.classList.remove("loading");
            document.body.classList.remove("bot-responding");

            // 1. Parse markdown ke HTML biasa
            const html = marked.parse(text);

            // 2. Convert HTML string ke DOM supaya bisa manipulasi dengan aman
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");

            // 3. Tambahkan target="_blank" ke <a href="http...">
            doc.querySelectorAll("a[href^='http']").forEach(a => {
                a.setAttribute("target", "_blank");
                a.setAttribute("rel", "noopener noreferrer");
            });

            // 4. Set hasil ke DOM
            textElement.innerHTML = doc.body.innerHTML;

            onFinish();
        }
    }, 10);
};

const generateResponse = async (botMsgDiv) => {
    const textElement = botMsgDiv.querySelector(".message-text");
    controller = new AbortController();
    document.body.classList.add("bot-responding");

    const apiKey = getApiKey();
    
    const configPayload = {
        api_key: apiKey,
        messages: buildMessagePayload() // sorted list of string
    };
    
    console.log("Sending configPayload:", configPayload);

    try {
        const response = await fetch("https://main-agent-production.up.railway.app/ask", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(configPayload),
            signal: controller.signal
        });

        const data = await response.json();
        console.log("Full response data:", data);

        if (!response.ok) throw new Error(data.error || "Unexpected error");

        const responseText = (data.answer || "").trim();
        typingEffect(responseText, textElement, botMsgDiv);

        checkingVizBtn();

        return data;

    } catch (error) {
        // textElement.style.color = "#d62939";
        textElement.style.color = "#000000ff";
        textElement.textContent = error.name === "AbortError"
            ? "Response generation stopped."
            : (error.message || "Failed to generate response.");
        
        return null;
    } finally {
        botMsgDiv.classList.remove("loading");
        document.body.classList.remove("bot-responding");
        userData.file = {};
    }
};

function setChatsActive(active) {
    if (active) {
        document.body.classList.add("chats-active");
        localStorage.setItem("chatsActive", "true");
    } else {
        document.body.classList.remove("chats-active");
        localStorage.setItem("chatsActive", "false");
    }
}

function getApiKey() {
    let apiKey = localStorage.getItem("api_key");

    if (!apiKey) {
        apiKey = prompt("Masukkan API Key Anda:");

        if (!apiKey || apiKey.trim() === "") {
            alert("API Key wajib diisi untuk melanjutkan.");
            return null;
        }

        localStorage.setItem("api_key", apiKey.trim());
    }

    return apiKey;
}

// Handle Submission
const handleFormSubmit = (e) => {
    e.preventDefault();
    const userMessage = promptInput.value.trim();
    if(!userMessage || document.body.classList.contains("bot-responding")) return;

    const chatTitle = document.querySelector('.chat-title');
    if (chatTitle.style.display === 'none') {
        chatTitle.style.display = 'none';
    }

    promptInput.value = "";
    chatHistory.push({
        role: "user",
        message: userMessage
    });
    saveChatHistory();
    document.body.classList.add("bot-responding");
    setChatsActive(true);
    fileUploadWrapper.classList.remove("active", "img-attached", "file-attached");

    document.addEventListener('click', (e) => {
        if (e.target.id === 'menu-toggle') {
            document.querySelector('.sidebar')?.classList.toggle('active');
        }
    });

    // Generate user message HTML and add to chats container
    const userMsgHTML = `
        <p class="message-text"></p>
        ${userData.file.data ? (userData.file.isImage ? `<img src="data:${userData.file.mime_type};base64,${userData.file.data}" class="img-attachment" />` : `<p class="file-attachment"><span class="material-symbols-rounded">description</span>${userData.file.fileName}</p>`) : "" }`;
    
    // console.log(userMsgHTML);
    const userMsgDiv = createMsgElement(userMsgHTML, "user-message");
    // console.log(userMsgDiv)
    userMsgDiv.querySelector(".message-text").textContent = userMessage;
    chatsContainer.appendChild(userMsgDiv);

    scrollToBottom();

    setTimeout(() => {
        // Generate bot message HTML and add to chats container
        const botMsgHTML = `<img src="./assets/chatbot.svg" alt="" class="avatar"><p class="message-text">Thinking..</p>`;
        // console.log(botMsgHTML);
        const botMsgDiv = createMsgElement(botMsgHTML, "bot-message", "loading");
        // console.log(botMsgDiv)
        chatsContainer.appendChild(botMsgDiv);
        scrollToBottom();
        // Generate response dan tunggu hasilnya
        generateResponse(botMsgDiv).then(responseData => {
            if (responseData) {
                scrollToBottom();
                chatHistory.push({
                    role: "bot",
                    message: responseData.answer
                });
                saveChatHistory();
            }
        }).catch(error => {
            console.error("Error in generateResponse:", error);
        });
    }, 600);
}

// Handle file input change
fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if(!file) return;

    const isImage = file.type.startsWith("image/");
    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = (e) => {
        fileInput.value = "";
        const base64String = e.target.result.split(",")[1];
        fileUploadWrapper.querySelector(".file-preview").src = e.target.result;
        fileUploadWrapper.classList.add("active", isImage ? "img-attached" : "file-attached");

        //  Store file data in userData obj
        userData.file = { fileName: file.name, data: base64String, mime_type: file.type, isImage };
    }
});

// Cancel file upload
document.querySelector("#cancel-file-btn").addEventListener("click", () => {
    userData.file = {};
    fileUploadWrapper.classList.remove("active", "img-attached", "file-attached");
});

// Cancel response ongoing
document.querySelector("#stop-response-btn").addEventListener("click", () => {
    userData.file = {};
    controller?.abort();
    clearInterval(typingInterval);
    chatsContainer.querySelector(".bot-message.loading").classList.remove("loading");
    document.body.classList.remove("bot-responding");
});

// Delete all chat history
document.querySelector("#delete-chats-btn").addEventListener("click", () => {
    chatHistory.length = 0;
    chatsContainer.innerHTML = "";

    localStorage.removeItem("chatHistory");

    document.body.classList.remove("bot-responding");
    setChatsActive(false);

    const chatTitle = document.querySelector('.chat-title');
    if (chatTitle.style.display === 'block') {
        chatTitle.style.display = 'none';
    }

    document.addEventListener('click', (e) => {
        if (e.target.id === 'menu-toggle') {
            document.querySelector('.sidebar')?.classList.toggle('active');
        }
    });
});

// Generate response from suggestion
document.querySelectorAll(".suggestions-item").forEach(item => {
    item.addEventListener("click", () => {
        promptInput.value = item.querySelector(".text").textContent;
        promptForm.dispatchEvent(new Event("submit"));
    });
});

// Show or hide controls from mobile on prompt input focus
document.addEventListener("click", ({ target }) => {
    const wrapper = document.querySelector(".prompt-wrapper");
    const shouldHide = target.classList.contains("prompt-input") || (wrapper.classList.contains("hide-controls") && (target.id === "add-file-btn" || target.id == "stop-response-btn"));
    wrapper.classList.toggle("hide-controls", shouldHide);
});

// Theme Toggle Button
themeToggle.addEventListener("click", () => {
    const isLightTheme = document.body.classList.toggle("light-theme");
    localStorage.setItem("themeColor", isLightTheme ? "light_mode" : "dark_mode");
    themeToggle.textContent = isLightTheme ? "dark_mode" : "light_mode";
});

// set initial local storage theme
if (!localStorage.getItem("themeColor")) {
    localStorage.setItem("themeColor", "light_mode");
}

const isLightTheme = localStorage.getItem("themeColor") === "light_mode";
document.body.classList.toggle("light-theme", isLightTheme);
themeToggle.textContent = isLightTheme ? "dark_mode" : "light_mode";

// Main initialization
window.addEventListener('DOMContentLoaded', () => {
    if (chatHistory.length > 0) {
        document.body.classList.add("chats-active");
    }
    checkingVizBtn();
    renderChatHistory();

});

function checkingVizBtn() {
    const toggleBtn = document.getElementById("toggleSidebarBtn");
    const vizItems = document.querySelectorAll(".viz-item");

    if (toggleBtn) {
        if (vizItems.length > 0) {
            toggleBtn.style.display = "block";
        } else {
            toggleBtn.style.display = "none";
        }
    }
}

class VisualizationManager {
    constructor() {
        this.vizBox = document.querySelector('.container-item');
        this.visualizationData = null;
        this.chartInstances = new Map();
        this.initEventListeners();
    }

    initEventListeners() {
        // Initial existing items (if any)
        this.vizItems = this.vizBox.querySelectorAll('.viz-item');
        this.vizItems.forEach(item => {
            const header = item.querySelector('.viz-header');
            header.addEventListener('click', () => this.toggleVizItem(item));
        });
    }

    async loadVisualizationConfig() {
        try {
            // You'll need to replace these with actual values
            const threadId = localStorage.getItem('thread_id');
            // const threadId = 'thread_id_1'
            console.log("Thread ID:", threadId);
            // const strDate = this.getCurrentDateString();
            const conv_idx = '1';
            
            const response = await fetch(`http://192.168.114.212:8103/tmp_file/${threadId}/${conv_idx}/visualization_config.json`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            this.visualizationData = await response.json();
            console.log('Visualization config loaded:', this.visualizationData);
        } catch (error) {
            console.error('Failed to load visualization config:', error);
            this.visualizationData = this.getSampleData();
        }
    }

    getCurrentDateString() {
        const now = new Date();

        const yyyy = now.getFullYear();
        const MM = String(now.getMonth() + 1).padStart(2, '0'); // bulan dari 0–11
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');

        return `${yyyy}${MM}${dd}${hh}${mm}${ss}`;
    }

    getSampleData() {
        // Fallback sample data for testing
        return [
            {
                "id": 1,
                "name": "Population by State",
                "type": "bar",
                "data": [
                    {"label": "Selangor", "value": 6000000, "unit": "people"},
                    {"label": "Johor", "value": 4000000, "unit": "people"},
                    {"label": "Sabah", "value": 3500000, "unit": "people"}
                ]
            },
            {
                "id": 2,
                "name": "Market Share 2025",
                "type": "pie",
                "data": [
                    {"label": "Product A", "value": 45, "unit": "%"},
                    {"label": "Product B", "value": 30, "unit": "%"},
                    {"label": "Product C", "value": 25, "unit": "%"}
                ]
            }
        ];
    }

    toggleVizItem(item) {
        const isExpanded = item.classList.contains('expanded');
        this.vizBox.querySelectorAll('.viz-item').forEach(otherItem => {
            if (otherItem !== item && otherItem.classList.contains('expanded')) {
                otherItem.classList.remove('expanded');
                this.disposeChart(otherItem);
            }
        });

        if (isExpanded) {
            item.classList.remove('expanded');
            this.onVizCollapse(item);
        } else {
            item.classList.add('expanded');
            this.onVizExpand(item);
        }
    }

    onVizExpand(item) {
        const vizId = item.dataset.vizId;
        console.log(`Visualization expanded: ${vizId}`);
        this.loadVisualizationData(vizId);
    }

    onVizCollapse(item) {
        const vizId = item.dataset.vizId;
        console.log(`Visualization collapsed: ${vizId}`);
        this.disposeChart(item);
    }

    disposeChart(item) {
        const vizId = item.dataset.vizId;
        const chartInstance = this.chartInstances.get(vizId);
        if (chartInstance) {
            chartInstance.dispose();
            this.chartInstances.delete(vizId);
        }
    }

    async loadVisualizationData(vizId) {
        console.log(`Loading data for visualization ${vizId}...`);
        
        if (!this.visualizationData) {
            console.warn('Visualization data not loaded yet');
            return;
        }

        const vizConfig = this.visualizationData.find(item => item.id.toString() === vizId.toString());
        
        if (!vizConfig) {
            console.log("Check the available data!!")
            console.log(this.visualizationData)
            console.error(`Visualization with id ${vizId} not found`);
            return;
        }
        this.renderVisualization(vizId, vizConfig);
    }

    renderVisualization(vizId, config) {
        const vizItem = this.vizBox.querySelector(`[data-viz-id="${vizId}"]`);
        const placeholder = vizItem.querySelector('.viz-placeholder');
        
        // Create chart container
        const chartContainer = document.createElement('div');
        chartContainer.style.width = '100%';
        chartContainer.style.height = '100%';
        chartContainer.id = `chart-${vizId}`;
        
        // Clear placeholder content and add chart container inside
        placeholder.innerHTML = '';
        placeholder.appendChild(chartContainer);
        
        // Initialize ECharts
        const chart = echarts.init(chartContainer);
        
        // Store chart instance for cleanup
        this.chartInstances.set(vizId, chart);
        
        // Generate chart options based on type
        let option;
        switch (config.type.toLowerCase()) {
            case 'bar':
                option = this.createBarChartOption(config);
                break;
            case 'line':
                option = this.createLineChartOption(config);
                break;
            case 'pie':
                option = this.createPieChartOption(config);
                break;
            default:
                console.error(`Unsupported chart type: ${config.type}`);
                return;
        }
        
        chart.setOption(option);

        window.addEventListener('resize', () => {
            chart.resize();
        });
    }

    createBarChartOption(config) {
        const defaultColors = {
            palette: ['#3B060A', '#8A0000', '#C83F12', '#ffd500ff'],
            defaultColor: '#ffd500ff'
        };
        const colors = {
            ...defaultColors,
            ...config.colors
        };
        const dataWithIndex = config.data.map((item, index) => ({
            ...item,
            originalIndex: index
        }));
        const sortedData = [...dataWithIndex].sort((a, b) => b.value - a.value);
        const colorMap = {};
        sortedData.forEach((item, index) => {
            colorMap[item.originalIndex] = index < 4 ? colors.palette[index] : colors.defaultColor;
        });

        return {
            tooltip: {
                trigger: 'axis',
                formatter: function(params) {
                    const param = params[0];
                    return `${param.name}: ${param.value.toLocaleString()} ${config.data[0].unit}`;
                }
            },
            xAxis: {
                type: 'category',
                data: config.data.map(item => item.label),
                axisLabel: {
                    rotate: 45, 
                    hideOverlap: true 
                }
            },
            yAxis: {
                type: 'value',
                axisLabel: {
                    formatter: function(value) {
                        return value.toLocaleString();
                    }
                }
            },
            series: [{
                data: config.data.map((item, index) => ({
                    value: item.value,
                    itemStyle: {
                        color: colorMap[index]
                    }
                })),
                type: 'bar'
            }],
            grid: {
                top: '5%',
                left: '20%',
                right: '10%',
                bottom: '5%',
                containLabel: true 
            }
        };
    }

    createLineChartOption(config) {
        return {
            tooltip: {
                trigger: 'axis',
                formatter: function(params) {
                    const param = params[0];
                    return `${param.name}: ${config.data[0].unit} ${param.value.toLocaleString()}`;
                }
            },
            xAxis: {
                type: 'category',
                data: config.data.map(item => item.label)
            },
            yAxis: {
                type: 'value',
                axisLabel: {
                    formatter: function(value) {
                        return value.toLocaleString();
                    }
                }
            },
            series: [{
                data: config.data.map(item => item.value),
                type: 'line',
                smooth: true,
                itemStyle: {
                    color: '#91cc75'
                },
                lineStyle: {
                    color: '#91cc75'
                }
            }],
            grid: {
                left: '15%',
                right: '10%',
                bottom: '15%'
            }
        };
    }

    createPieChartOption(config) {
        const colors = ['#FE9321', '#6EFE3C', '#185D7A', '#C8DB2A', '#EF4687'];
        const total = config.data.reduce((sum, item) => sum + Number(item.value || 0), 0);
        return {
            color: colors,
            tooltip: {
                trigger: 'item',
                formatter: function(params) {
                    const value = Number(params.value || 0);
                    const percent = total ? ((value / total) * 100).toFixed(2) : 0;
                    const unit = config.data[0].unit || ''; 
                    return `${params.name}: ${value.toLocaleString()} ${unit} (${percent}%)`;
                }
            },
            legend: {
                orient: 'vertical',
                left: 'left'
            },
            series: [{
                type: 'pie',
                radius: '50%',
                data: config.data.map((item, index) => ({
                    value: item.value,
                    name: item.label,
                    itemStyle: {
                        color: colors[index % colors.length]
                    }
                })),
                emphasis: {
                    itemStyle: {
                        shadowBlur: 10,
                        shadowOffsetX: 0,
                        shadowColor: 'rgba(0, 0, 0, 0.5)'
                    }
                }
            }]
        };
    }

    addVisualization(config) {
        const vizHtml = this.createVizItemHTML(config);
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = vizHtml;
        const newVizItem = tempDiv.firstElementChild;

        this.vizBox.prepend(newVizItem);

        const header = newVizItem.querySelector('.viz-header');
        header.addEventListener('click', () => this.toggleVizItem(newVizItem));
    }

    createVizItemHTML(config) {
        return `
            <div class="viz-item" data-viz-id="${config.id}">
                <div class="viz-header">
                    <div class="viz-info">
                        <div class="viz-type">${this.capitalize(config.type)} Chart</div>
                        <div class="viz-title">${config.name}</div>
                    </div>
                    <div class="viz-toggle">▼</div>
                </div>
                <div class="viz-content">
                    <div class="viz-content-inner">
                        <div class="viz-placeholder">${config.name} Visualization Area</div>
                    </div>
                </div>
            </div>
        `;
    }

    capitalize(text) {
        return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
    }

    clearVisualizations() {
        // Dispose all chart instances before removing elements
        this.chartInstances.forEach(chart => chart.dispose());
        this.chartInstances.clear();
        
        this.vizBox.querySelectorAll('.viz-item').forEach(item => item.remove());
    }

    loadFromList(visualizationList) {
        visualizationList.forEach(config => {
            if (config.type !== 'map') {
                this.addVisualization(config);
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.vizManager = new VisualizationManager();
});

function capitalizeChartType(type) {
    if (!type) return "";
    return type.charAt(0).toUpperCase() + type.slice(1);
}

document.addEventListener("DOMContentLoaded", function () {
    const sidebar = document.querySelector(".visualization-box");
    const toggleBtn = document.getElementById("toggleSidebarBtn");
    const closeBtn = sidebar?.querySelector(".close-sidebar-btn");
    const promptInput = document.querySelector(".prompt-container");

    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener("click", function () {
            sidebar.classList.add("toggleBar");
            toggleBtn.style.display = "none";
            promptInput.classList.add("slide");
            vizManager.loadVisualizationConfig();
        });
    }

    if (closeBtn && sidebar) {
        closeBtn.addEventListener("click", function () {
            sidebar.classList.remove("toggleBar");
            toggleBtn.style.display = "block";
            promptInput.classList.remove("slide");
        });
    }
});

promptForm.addEventListener("submit", handleFormSubmit);
promptForm.querySelector("#add-file-btn").addEventListener("click", () => fileInput.click());