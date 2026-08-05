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
# Скачиваем XTLS installer в файл, проверяем что он реально получен (непустой + shebang).
# Иначе bash -c "$(curl ...)" при офлайне выполнял пустую строку с кодом 0 → ложный успех.
XTLS_REMOVE_SCRIPT=$(mktemp /tmp/xray-install-remove.XXXXXX.sh)
if curl -fsSL https://github.com/XTLS/Xray-install/raw/main/install-release.sh -o "$XTLS_REMOVE_SCRIPT" \
   && head -n 1 "$XTLS_REMOVE_SCRIPT" | grep -q "^#!/bin/bash"; then
    if bash "$XTLS_REMOVE_SCRIPT" @ remove > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Xray-core удален (по штатному скрипту XTLS)${NC}\n"
    else
        echo -e "${YELLOW}⚠ Официальный скрипт XTLS не отработал — удаляю бинарь вручную${NC}\n"
    fi
else
    echo -e "${YELLOW}⚠ Не удалось скачать скрипт XTLS (сеть?) — удаляю бинарь вручную${NC}\n"
fi
rm -f "$XTLS_REMOVE_SCRIPT"
# Явная зачистка на случай, если скрипт XTLS не отработал
rm -f /usr/local/bin/xray
rm -rf /usr/local/share/xray

echo -e "${BLUE}[3/7]${NC} ${YELLOW}Удаление конфигураций и профилей...${NC}"
# Собираем динамические порты инбаундов и маршрутов ДО удаления конфига,
# чтобы затем вычистить их из UFW (иначе пользовательские порты останутся открытыми).
ALL_XRAY_PORTS=""
if command -v jq > /dev/null 2>&1 && [[ -f /usr/local/etc/xray/config.json ]]; then
    ALL_XRAY_PORTS=$(jq -r '[.inbounds[].port] | unique | .[]' /usr/local/etc/xray/config.json 2>/dev/null || true)
fi
if [[ -d /usr/local/etc/xray/profiles ]]; then
    for pf in /usr/local/etc/xray/profiles/*.json; do
        [[ -f "$pf" ]] || continue
        ROUTE_PORTS=$(jq -r '(.routes // []) | .[].port' "$pf" 2>/dev/null || true)
        ALL_XRAY_PORTS=$(printf '%s\n%s\n' "$ALL_XRAY_PORTS" "$ROUTE_PORTS")
    done
fi
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
    # Дефолтные порты + динамические порты, собранные из real config/profiles (до удаления).
    for p in 443/tcp 8443/tcp 8080/tcp 9443/tcp 9444/tcp $(echo "${ALL_XRAY_PORTS:-}" | tr ' ' '\n'); do
        [[ -n "$p" ]] || continue
        port="${p%%/*}"
        if [[ "$port" =~ ^[0-9]+$ ]]; then
            ufw delete allow "${port}/tcp" > /dev/null 2>&1 || true
            ufw delete allow "${port}/udp" > /dev/null 2>&1 || true
        fi
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
