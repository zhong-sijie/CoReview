import "./tailwind.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { initializeVSCodeService } from "./services/vscodeService";

/**
 * 应用入口文件
 *
 * VS Code WebView应用的启动入口，负责初始化核心服务和渲染React应用。
 * 在应用启动时初始化VS Code服务，然后渲染主应用组件。
 *
 * 执行流程：
 * 1. 初始化VS Code服务，建立与扩展端的通信
 * 2. 创建React根节点
 * 3. 渲染主应用组件
 */

/**
 * 初始化 VSCode 服务
 *
 * 在应用启动时初始化VS Code服务，建立与扩展端的通信通道。
 * 必须在渲染React应用之前调用，确保通信服务可用。
 */
initializeVSCodeService();

/**
 * 创建React根节点并渲染应用
 *
 * 使用React 18的createRoot API创建根节点，并渲染主应用组件。
 * 启用StrictMode以帮助发现潜在问题。
 */
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
