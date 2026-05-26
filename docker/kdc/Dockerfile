FROM rockylinux:9

RUN dnf install -y krb5-server krb5-workstation && dnf clean all

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 88/tcp 88/udp 749/tcp

ENTRYPOINT ["/entrypoint.sh"]
