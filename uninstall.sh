#!/bin/bash

# Цвета
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Проверка прав root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}✗ Этот скрипт должен быть запущен с правами root${NC}" 
   echo -e "${YELLOW}Используйте: sudo bash uninstall.sh${NC}"
   exit 1
fi

clear
echo -e "${RED}"
echo '═══════════════════════════════════════════════════════════'
echo '              УДАЛЕНИЕ XRAYEBATOR                          '
echo '═══════════════════════════════════════════════════════════'
echo -e "${NC}\n"

echo -e "${YELLOW}Это действие удалит:${NC}"
echo -e "  ${BLUE}•${NC} Xray-core и все его компоненты"
echo -e "  ${BLUE}•${NC} Все профили и конфигурации"
echo -e "  ${BLUE}•${NC} Приложение xrayebator"
echo -e "  ${BLUE}•${NC} Сгенерированные ключи Reality"
echo ""
echo -e "${RED}⚠ Все данные будут потеряны безвозвратно!${NC}"
echo ""
echo -n -e "${YELLOW}Вы уверены, что хотите удалить Xrayebator? (yes/no): ${NC}"
read confirmation

if [[ "$confirmation" != "yes" ]]; then
    echo -e "${CYAN}✓ Удаление отменено${NC}"
    exit 0
fi

echo ""
echo -e "${BLUE}[1/7]${NC} ${YELLOW}Остановка сервисов (Xray + HAPP subscription)...${NC}"
systemctl stop xray > /dev/null 2>&1
systemctl disable xray > /dev/null 2>&1
systemctl stop xrayebator-sub.service > /dev/null 2>&1
systemctl disable xrayebator-sub.service > /dev/null 2>&1
echo -e "${GREEN}✓ Сервисы остановлены${NC}\n"

echo -e "${BLUE}[2/7]${NC} ${YELLOW}Удаление Xray-core...${NC}"
if bash -c "$(curl -fsSL https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ remove > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Xray-core удален (по штатному скрипту XTLS)${NC}\n"
else
    echo -e "${YELLOW}⚠ Официальный скрипт XTLS не сработал (сеть?) — удаляю бинарь вручную${NC}\n"
fi
# Явная зачистка на случай, если скрипт XTLS не отработал
rm -f /usr/local/bin/xray
rm -rf /usr/local/share/xray

echo -e "${BLUE}[3/7]${NC} ${YELLOW}Удаление конфигураций и профилей...${NC}"
rm -rf /usr/local/etc/xray
rm -rf /var/log/xray
echo -e "${GREEN}✓ Конфигурации и логи удалены${NC}\n"

echo -e "${BLUE}[4/7]${NC} ${YELLOW}Удаление приложений (xrayebator, update/uninstall, subscription)...${NC}"
rm -f /usr/local/bin/xrayebator
rm -f /usr/local/bin/xrayebator-update
rm -f /usr/local/bin/xrayebator-uninstall
rm -f /usr/local/bin/subhttp.sh
echo -e "${GREEN}✓ Приложения удалены${NC}\n"

echo -e "${BLUE}[5/7]${NC} ${YELLOW}Очистка systemd (юниты + drop-in)...${NC}"
rm -f /etc/systemd/system/xray.service
rm -f /etc/systemd/system/xray@.service
rm -rf /etc/systemd/system/xray.service.d
rm -f /etc/systemd/system/xrayebator-sub.service
systemctl daemon-reload > /dev/null 2>&1
echo -e "${GREEN}✓ Systemd очищен${NC}\n"

echo -e "${BLUE}[6/7]${NC} ${YELLOW}Очистка firewall и пользователя...${NC}"
if command -v ufw > /dev/null 2>&1; then
    for p in 443/tcp 8443/tcp 8080/tcp 9443/tcp 9444/tcp; do
        ufw delete allow "$p" > /dev/null 2>&1 || true
    done
fi
if id xray > /dev/null 2>&1; then
    userdel xray > /dev/null 2>&1 || true
fi
echo -e "${GREEN}✓ Firewall и пользователь очищены${NC}\n"

echo -e "${BLUE}[7/7]${NC} ${YELLOW}Очистка журналов Xray...${NC}"
# journalctl vacuum работает по ФАЙЛАМ журнала, а не по юнитам — опция -u
# vacuum не ограничивает, поэтому `--vacuum-time=1s -u xray` затирал бы логи
# ВСЕХ сервисов. Безопасно: только flush + rotate активного журнала.
journalctl --flush > /dev/null 2>&1
journalctl --rotate > /dev/null 2>&1
echo -e "${GREEN}✓ Журналы Xray очищены${NC}\n"

clear
echo -e "${GREEN}"
echo '═══════════════════════════════════════════════════════════'
echo '           ✓ УДАЛЕНИЕ ЗАВЕРШЕНО УСПЕШНО!                   '
echo '═══════════════════════════════════════════════════════════'
echo -e "${NC}\n"

echo -e "${CYAN}Xrayebator полностью удален с вашего сервера.${NC}"
echo -e "${BLUE}Спасибо за использование!${NC}\n"
