/**
 * UI Utilities for Toasts, Goals, and Screenshots.
 */

function showToast(message) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    if (!toast || !toastMessage) return;

    toastMessage.innerText = message;
    toast.classList.remove('translate-y-20', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');

    setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 2500);
}

function reachGoal(goalId) {
    console.log("Goal reached:", goalId);
    if (typeof ym !== "undefined") {
        ym(110360838, 'reachGoal', goalId);
    }
}

async function takeScreenshot(elementId = 'screenshot-area', filename = 'calculation.png') {
    const element = document.getElementById(elementId);
    if (!element) {
        console.error('Screenshot element not found:', elementId);
        return;
    }

    reachGoal("share_click");
    showToast("Подготовка скриншота...");

    try {
        const canvas = await html2canvas(element, {
            backgroundColor: '#f8fafc',
            scale: 2,
            logging: false,
            useCORS: true
        });

        canvas.toBlob((blob) => {
            const file = new File([blob], filename, { type: "image/png" });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                navigator.share({
                    files: [file],
                    title: 'Мой расчет',
                    text: 'Посмотри на результаты моего расчета!'
                }).then(() => showToast("Успешно отправлено!"))
                  .catch((err) => console.log('User cancelled share', err));
            } else {
                const link = document.createElement('a');
                link.download = filename;
                link.href = canvas.toDataURL('image/png');
                link.click();
                showToast("Скриншот скачан!");
            }
        }, 'image/png');
    } catch (err) {
        console.error('Screenshot error:', err);
        showToast("Ошибка при создании скриншота");
    }
}

function shareLink() {
    reachGoal("share_click");
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
        showToast("Ссылка скопирована!");
    }).catch(err => {
        console.error('Copy error:', err);
    });
}
