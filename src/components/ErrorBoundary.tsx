import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Result, Button } from 'antd';

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="p-8 flex justify-center items-center h-screen">
                    <Result
                        status="500"
                        title="应用程序遇到错误"
                        subTitle={`抱歉，发生了一些意外情况: ${this.state.error?.message}`}
                        extra={<Button type="primary" onClick={() => window.location.reload()}>刷新页面</Button>}
                    />
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
