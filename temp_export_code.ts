
        // V3.0 美化版PDF导出：使用 html2canvas 渲染整个报告
        const [isExporting, setIsExporting] = useState(false);
    
        const handleExportPdf = async () => {
            if (!diffResult || !baseFile || !targetFile) {
                message.warning('暂无对比结果可导出');
                return;
            }
    
            try {
                setIsExporting(true); // 显示隐藏的报告模版
                message.loading({ content: '正在生成高清PDF报告...', key: 'pdfExport' });
                
                // 给React一点时间渲染DOM
                await new Promise(resolve => setTimeout(resolve, 500));
    
                const element = document.getElementById('pdf-report-container');
                if (!element) {
                    throw new Error('Report container not found');
                }
    
                const { default: html2canvas } = await import('html2canvas');
                const { default: jsPDF } = await import('jspdf');
    
                const canvas = await html2canvas(element, {
                    scale: 2, // 提高清晰度
                    useCORS: true,
                    logging: false,
                    windowWidth: element.scrollWidth,
                    windowHeight: element.scrollHeight
                });
    
                const imgData = canvas.toDataURL('image/jpeg', 0.95);
                
                // A4 尺寸
                const pdf = new jsPDF('p', 'mm', 'a4');
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = pdf.internal.pageSize.getHeight();
                
                const imgWidth = pdfWidth;
                const imgHeight = (canvas.height * imgWidth) / canvas.width;
    
                let heightLeft = imgHeight;
                let position = 0;
    
                // 第一页
                pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
                heightLeft -= pdfHeight;
    
                // 如果内容超过一页，分页处理
                while (heightLeft > 0) {
                    position = heightLeft - imgHeight;
                    pdf.addPage();
                    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
                    heightLeft -= pdfHeight;
                }
    
                const now = new Date();
                const fileName = `comparison_report_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.pdf`;
                pdf.save(fileName);
                
                message.success({ content: `PDF已导出: ${fileName}`, key: 'pdfExport' });
            } catch (err) {
                console.error('PDF export error:', err);
                message.error({ content: 'PDF导出失败', key: 'pdfExport' });
            } finally {
                setIsExporting(false);
            }
        };
