#!/bin/bash

# ============================================================
# Vehicle Parameter 项目启动脚本
# ============================================================

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# 获取脚本所在目录，切换到项目根目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# 打印带颜色的消息
print_header() {
    echo -e "\n${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC}  ${BOLD}🚗 Vehicle Parameter Manager${NC}                              ${BLUE}║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}\n"
}

print_info() {
    echo -e "${CYAN}ℹ${NC}  $1"
}

print_success() {
    echo -e "${GREEN}✓${NC}  $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC}  $1"
}

print_error() {
    echo -e "${RED}✗${NC}  $1"
}

# ============================================================
# 环境检查
# ============================================================
check_environment() {
    echo -e "${BOLD}📋 环境检查${NC}\n"
    
    local all_passed=true
    
    # 检查 Node.js
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v)
        REQUIRED_VERSION="v18"
        if [[ "$NODE_VERSION" > "$REQUIRED_VERSION" ]] || [[ "$NODE_VERSION" == "$REQUIRED_VERSION"* ]]; then
            print_success "Node.js: $NODE_VERSION"
        else
            print_warning "Node.js: $NODE_VERSION (建议 >= $REQUIRED_VERSION)"
        fi
    else
        print_error "Node.js 未安装"
        echo -e "   请访问 https://nodejs.org 安装 Node.js"
        all_passed=false
    fi
    
    # 检查 npm
    if command -v npm &> /dev/null; then
        NPM_VERSION=$(npm -v)
        print_success "npm: v$NPM_VERSION"
    else
        print_error "npm 未安装"
        all_passed=false
    fi
    
    # 检查 Rust (可选，用于 Tauri)
    if command -v rustc &> /dev/null; then
        RUST_VERSION=$(rustc --version | cut -d ' ' -f 2)
        print_success "Rust: $RUST_VERSION (可构建桌面应用)"
    else
        print_info "Rust 未安装 (仅影响桌面应用构建)"
    fi
    
    echo ""
    
    if [ "$all_passed" = false ]; then
        print_error "环境检查未通过，请先安装必要依赖"
        exit 1
    fi
}

# ============================================================
# 依赖安装检查
# ============================================================
check_dependencies() {
    if [ ! -d "node_modules" ]; then
        print_warning "node_modules 不存在，正在安装依赖..."
        echo ""
        npm install
        if [ $? -eq 0 ]; then
            print_success "依赖安装完成"
        else
            print_error "依赖安装失败"
            exit 1
        fi
        echo ""
    else
        print_success "依赖已安装"
    fi
}

# ============================================================
# 显示版本信息
# ============================================================
show_version() {
    VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")
    echo -e "${CYAN}版本:${NC} v$VERSION"
    echo ""
}

# ============================================================
# 显示菜单
# ============================================================
show_menu() {
    echo -e "${BOLD}请选择启动模式:${NC}\n"
    echo -e "  ${GREEN}1)${NC} 🌐 Web 开发模式      ${CYAN}(npm run dev)${NC}"
    echo -e "  ${GREEN}2)${NC} 🖥️  Tauri 桌面开发    ${CYAN}(npm run tauri dev)${NC}"
    echo -e "  ${GREEN}3)${NC} 👁️  预览构建结果      ${CYAN}(npm run preview)${NC}"
    echo -e "  ${GREEN}4)${NC} 📦 构建生产版本      ${CYAN}(npm run build)${NC}"
    echo -e "  ${GREEN}5)${NC} 🏗️  构建桌面应用      ${CYAN}(npm run tauri build)${NC}"
    echo -e "  ${GREEN}6)${NC} 🔍 代码检查          ${CYAN}(npm run lint)${NC}"
    echo -e "  ${GREEN}0)${NC} 退出\n"
}

# ============================================================
# 执行选择的操作
# ============================================================
execute_choice() {
    case $1 in
        1)
            echo -e "\n${BLUE}🚀 启动 Web 开发服务器...${NC}\n"
            npm run dev
            ;;
        2)
            if ! command -v rustc &> /dev/null; then
                print_error "Tauri 需要 Rust 环境，请先安装: https://rustup.rs"
                exit 1
            fi
            echo -e "\n${BLUE}🚀 启动 Tauri 桌面开发模式...${NC}\n"
            npm run tauri dev
            ;;
        3)
            if [ ! -d "dist" ]; then
                print_warning "未找到构建产物，先执行构建..."
                npm run build
            fi
            echo -e "\n${BLUE}🚀 启动预览服务器...${NC}\n"
            npm run preview
            ;;
        4)
            echo -e "\n${BLUE}📦 构建生产版本...${NC}\n"
            npm run build
            ;;
        5)
            if ! command -v rustc &> /dev/null; then
                print_error "Tauri 需要 Rust 环境，请先安装: https://rustup.rs"
                exit 1
            fi
            echo -e "\n${BLUE}🏗️ 构建桌面应用...${NC}\n"
            npm run tauri build
            ;;
        6)
            echo -e "\n${BLUE}🔍 运行代码检查...${NC}\n"
            npm run lint
            ;;
        0)
            echo -e "\n${GREEN}再见！👋${NC}\n"
            exit 0
            ;;
        *)
            print_error "无效的选择"
            return 1
            ;;
    esac
}

# ============================================================
# 快捷启动模式 (命令行参数)
# ============================================================
quick_start() {
    case $1 in
        dev|d)
            execute_choice 1
            ;;
        tauri|t)
            execute_choice 2
            ;;
        preview|p)
            execute_choice 3
            ;;
        build|b)
            execute_choice 4
            ;;
        tauri-build|tb)
            execute_choice 5
            ;;
        lint|l)
            execute_choice 6
            ;;
        help|h|--help|-h)
            echo -e "${BOLD}用法:${NC} ./scripts/start.sh [选项]\n"
            echo -e "${BOLD}选项:${NC}"
            echo -e "  dev, d          启动 Web 开发模式"
            echo -e "  tauri, t        启动 Tauri 桌面开发"
            echo -e "  preview, p      预览构建结果"
            echo -e "  build, b        构建生产版本"
            echo -e "  tauri-build, tb 构建桌面应用"
            echo -e "  lint, l         代码检查"
            echo -e "  help, h         显示帮助信息"
            echo ""
            exit 0
            ;;
        *)
            return 1
            ;;
    esac
    exit 0
}

# ============================================================
# 主程序
# ============================================================
main() {
    print_header
    show_version
    check_environment
    check_dependencies
    
    # 如果有命令行参数，使用快捷模式
    if [ -n "$1" ]; then
        quick_start "$1"
    fi
    
    # 交互式菜单
    while true; do
        show_menu
        read -p "请输入选项 [0-6]: " choice
        execute_choice "$choice"
        
        # 如果命令执行完毕（非服务器类），询问是否继续
        if [[ "$choice" =~ ^[3-6]$ ]]; then
            echo ""
            read -p "按 Enter 返回菜单，或输入 q 退出: " cont
            if [ "$cont" = "q" ]; then
                echo -e "\n${GREEN}再见！👋${NC}\n"
                exit 0
            fi
        fi
    done
}

# 运行主程序
main "$@"
